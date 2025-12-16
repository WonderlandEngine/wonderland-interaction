import {vec3, quat2, quat} from 'gl-matrix';
import {
    clamp,
    Component,
    Emitter,
    Object3D,
    PhysXComponent,
    Property,
    WonderlandEngine,
} from '@wonderlandengine/api';
import {property} from '@wonderlandengine/api/decorators.js';

import {Interactor} from './interactor.js';
import {HistoryTracker} from '../history-tracker.js';
import {computeRelativeTransform, isPointEqual, toRad} from '../utils/math.js';
import {
    GrabPoint,
    GrabSnapMode,
    InteractorVisualState,
    InteractorVisualStateNames,
} from './grab-point.js';
import {
    computeLocalPositionForPivot,
    rotateAroundPivot,
    rotateFreeDual,
} from './providers.js';
import {FORWARD, RIGHT, UP} from '../constants.js';
import {TempDualQuat, TempQuat, TempVec3} from '../internal-constants.js';
import {componentError, enumStringKeys} from '../utils/wle.js';

/* Constants */

const MAX_GRABS = 2;
const GRAB_EPSILON_DIST = 0.005; /* Half centimeter. */
const GRAB_EPSILON_ANGLE = toRad(0.5); /* Half a degree */

export enum GrabTransformType {
    Hand = 0,
    AroundPivot,
}
/** List of string keys for {@link GrabTransformType}. */
const GrabTransformTypeNames = enumStringKeys(GrabTransformType);

export enum PivotAxis {
    X = 0,
    Y,
    Z,
}
/** List of string keys for {@link PivotAxis}. */
export const PivotAxisNames = enumStringKeys(PivotAxis);

function axis(axis: PivotAxis.X | PivotAxis.Y | PivotAxis.Z) {
    switch (axis) {
        case PivotAxis.X:
            return RIGHT;
        case PivotAxis.Y:
            return UP;
        case PivotAxis.Z:
            return FORWARD;
    }
}

/** Temporaries associated to a grab point upon interaction. */
interface GrabData {
    interactor: Interactor;
    handleId: number;

    /** Local grab anchor position */
    localAnchor: vec3;
}

/**
 * Enables objects to be interactively grabbed and manipulated in a virtual environment.
 *
 * The `Grabbable` class extends the basic functionality provided by the {@link Interactable}
 * component to allow objects to be picked up, held, and potentially thrown by the user. It
 * facilitates the creation of immersive and interactive experiences by providing an intuitive
 * interface for object manipulation within a 3D scene.
 */
export class Grabbable extends Component {
    static TypeName = 'grabbable';

    /** @override */
    static onRegister(engine: WonderlandEngine) {
        engine.registerComponent(GrabPoint);
    }

    /** Properties */

    /**
     * List of objects to use as grab points.
     *
     * @note If no object is provided, the grabbable is treated as its own grab point.
     * @note Objects with no {@link GrabPoint} component will have a default one created.
     */
    @property.array(Property.object())
    public handleObjects: Object3D[] = [];

    /**
     * Whether the object can be thrown with physics or not.
     *
     * When the interactor releases this grabbable, it will be thrown based on
     * the velocity the interactor had.
     */
    @property.bool(true)
    public canThrow = true;

    /**
     * Linear multiplier for the throwing speed.
     *
     * By default, throws at the controller speed.
     */
    @property.float(1.0)
    public throwLinearIntensity = 1.0;

    /**
     * Linear multiplier for the throwing angular  speed.
     *
     * By default, throws at the controller speed.
     */
    @property.float(1.0)
    public throwAngularIntensity = 1.0;

    /**
     * If `true`, the grabbable will be updated based on the controller
     * velocity data, if available.
     *
     * When `false`, the linear and angular velocities will be emulated based on
     * the grabbable previous orientation and position.
     *
     * For more information, have a look at:
     * - [linearVelocity](https://developer.mozilla.org/en-US/docs/Web/API/XRPose/linearVelocity)
     * - [angularVelocity](https://developer.mozilla.org/en-US/docs/Web/API/XRPose/angularVelocity)
     */
    @property.bool(true)
    public useControllerVelocityData = true;

    /**
     * Max distance to automatically stop grabbing.
     *
     * @note Set a negative value to disable.
     */
    @property.float(0.25)
    public releaseDistance = 0.25;

    /**
     * The distance marker to use when distance-grabbed.
     */
    @property.object()
    public distanceMarker: Object3D | null = null;

    /**
     * The index of the handle to use when distance-grabbed.
     *
     * Use `0` for {@link handle} and `1` for {@link handleSecondary}.
     */
    @property.int(0)
    public distanceHandle = 0;

    @property.enum(GrabTransformTypeNames, GrabTransformType.Hand)
    public transformType = GrabTransformType.Hand;

    /** Pivot axis used when {@link transformType} is set to {@link GrabRotationType.AroundPivot} */
    @property.enum(PivotAxisNames, PivotAxis.Y)
    public pivotAxis: PivotAxis = PivotAxis.Y;

    @property.object()
    public secondaryPivot: Object3D | null = null;

    /** Pivot axis used when {@link transformType} is set to {@link GrabRotationType.AroundPivot} */
    @property.enum(PivotAxisNames, PivotAxis.Y)
    public secondaryPivotAxis: PivotAxis = PivotAxis.Y;

    @property.bool(false)
    public invertRotation = false;

    /**
     * Visual state to apply to the interactor once interaction occurs.
     *
     * @note Behavior overriden by {@link GrabPoint.interactorVisualState} if set.
     */
    @property.enum(InteractorVisualStateNames, InteractorVisualState.None)
    interactorVisualState = InteractorVisualState.None;

    /** Public Attributes */

    grabPoints: GrabPoint[] = [];

    /** Notifies once a grab point is selected for interaction. */
    onGrabPointSelect: Emitter<[this, GrabPoint]> = new Emitter();

    /** Notifies once a grab point is released. */
    onGrabPointRelease: Emitter<[this, GrabPoint]> = new Emitter();

    /**
     * Notifies once this object is grabbed.
     *
     * @note The notification only occurs when first grabbed.
     */
    onGrabStart: Emitter<[this]> = new Emitter();

    /**
     * Notifies once this object is released.
     *
     * @note The notification only occurs when both grip point are free.
     */
    onGrabEnd: Emitter<[this]> = new Emitter();

    /** Private Attributes. */

    /** Cached currently grabbed data. */
    private _grabData: GrabData[] = [];

    /**
     * Squared distance to automatically stop a grab when:
     * - Using dual grabbing
     * - Moving away from a locked grab
     */
    private _history: HistoryTracker = new HistoryTracker();
    private _physx: PhysXComponent | null = null;

    /**
     * Relative grab transform to apply every update, used
     * to maintain the object transform when grab starts.
     *
     * @note Can be local or world based on the transformation type.
     */
    private _relativeGrabTransform: quat2 = quat2.create();

    /**
     * Relative pivot's grab transform to apply every update, used
     * to maintain the object transform when grab starts.
     */
    private _pivotGrabTransform = quat2.create();

    private _useUpOrientation: boolean = false;

    /** `true` if the transform is computed and applied in world space, `false` otherwise. */
    private _computeWorldSpace = false;

    /** `true` if the grabbable should continue lerping to the target rotation / position. */
    private _lerp = false;

    init() {
        this.grabPoints = this.handleObjects.map((o) => {
            return o.getComponent(GrabPoint) ?? o.addComponent(GrabPoint)!;
        });
        if (this.grabPoints.length === 0) {
            const handle =
                this.object.getComponent(GrabPoint) ?? this.object.addComponent(GrabPoint)!;
            this.grabPoints.push(handle);
        }
    }

    start(): void {
        this._physx = this.object.getComponent('physx');
    }

    onActivate(): void {
        this._computeWorldSpace = this.transformType === GrabTransformType.Hand;
    }

    update(dt: number): void {
        for (let i = this._grabData.length - 1; i >= 0; --i) {
            const grab = this._grabData[i];
            // TODO: Remove alloc.
            const handlePosition = this.object.transformPointWorld(
                vec3.create(),
                grab.localAnchor
            );
            const handPosition = grab.interactor.object.getPositionWorld();
            const squaredDistance = vec3.squaredDistance(handPosition, handlePosition);
            if (squaredDistance <= this.releaseDistance * this.releaseDistance) continue;
            /* Hands are too far apart, release the second handle. */
            this.release(grab.interactor);
        }

        if (!this.isGrabbed) return;

        const primaryInteractor = this.primaryGrab!.interactor.object;
        const secondaryInteractor = this.secondaryGrab?.interactor.object ?? null;

        const currentPos = vec3.create();
        const currentRot = quat.create();
        if (this._computeWorldSpace) {
            this.object.getPositionWorld(currentPos);
            this.object.getRotationWorld(currentRot);
        } else {
            this.object.getPositionLocal(currentPos);
            this.object.getRotationLocal(currentRot);
        }

        const rotation = quat.create();
        vec3.copy(rotation, currentRot);

        const position = vec3.create();
        vec3.copy(position, currentPos);

        const transform = TempDualQuat.get();
        const pivotRot = TempQuat.get();

        this.computeTransform(transform, pivotRot, primaryInteractor, secondaryInteractor);
        quat2.getTranslation(position, transform);
        quat2.getReal(rotation, transform as quat);
        quat.normalize(rotation, rotation);

        if (this._lerp) {
            const primaryHandle = this.grabPoints[this.primaryGrab!.handleId];
            let lerp = primaryHandle.snapLerp;
            if (this.secondaryGrab) {
                const secondaryHandle = this.grabPoints[this.secondaryGrab.handleId];
                lerp = Math.max(lerp, secondaryHandle.snapLerp);
            }
            lerp = clamp(lerp, 0, 1);

            vec3.lerp(position, currentPos, position, lerp);
            quat.slerp(rotation, currentRot, rotation, lerp);
            quat.normalize(rotation, rotation);

            this._lerp =
                !isPointEqual(position, currentPos, GRAB_EPSILON_DIST) ||
                !(quat.getAngle(rotation, currentRot) < GRAB_EPSILON_ANGLE);
        }

        if (this._computeWorldSpace) {
            this.object.setPositionWorld(position);
            this.object.setRotationWorld(rotation);
        } else {
            this.object.setPositionLocal(position);
            this.object.setRotationLocal(rotation);
        }

        if (this.secondaryPivot) {
            this.secondaryPivot.setRotationLocal(pivotRot);
        }

        TempQuat.free();
        TempDualQuat.free();

        const xrPose = this.primaryGrab!.interactor.input.xrPose;
        if (xrPose && this.useControllerVelocityData) {
            this._history.updateFromPose(
                xrPose,
                this.primaryGrab!.interactor.trackedSpace,
                this.object,
                dt
            );
        } else {
            this._history.update(this.object, dt);
        }
    }

    /**
     * Throws the grabbable.
     */
    throw(interactor: Interactor): void {
        if (!this._physx) {
            return;
        }
        this._setKinematicState(false);

        const angular = this._history.angular(TempVec3.get());
        vec3.scale(angular, angular, this.throwAngularIntensity);

        const velocity = this._history.velocity(TempVec3.get());
        vec3.scale(velocity, velocity, this.throwLinearIntensity);

        const radius = vec3.subtract(
            TempVec3.get(),
            this.object.getPositionWorld(TempVec3.get()),
            interactor.object.getPositionWorld(TempVec3.get())
        );
        vec3.cross(radius, angular, radius);
        vec3.add(velocity, velocity, radius);

        this._physx.angularVelocity = angular;
        this._physx.linearVelocity = velocity;

        TempVec3.free(5);
    }

    /**
     * Programmatically grab an interactable.
     *
     * @remarks
     * The interactable must be one of {@link Grabbable.handle}
     * or {@link Grabbable.handleSecondary}.
     *
     * This method is useful for grab emulation for non-VR applications.
     * In general, you will not call this method but rather rely on collision
     * checks between the {@link Interactor} and the {@link Interactable}.
     *
     * @param interactor The interactor issuing the interaction.
     * @param interactable The interactable undergoing the action.
     */
    grab(interactor: Interactor, handleId: number) {
        if (this._grabData.length === MAX_GRABS) return;

        const grab: GrabData = {
            interactor,
            handleId,
            localAnchor: vec3.create(),
        };
        this._grabData.push(grab);

        const dual = this._grabData.length > 1;
        if (dual && handleId === 0) {
            /* Ensure primary grab is always first */
            const second = this._grabData[0];
            this._grabData[0] = this._grabData[1];
            this._grabData[1] = second;
        }

        const handle = this.grabPoints[handleId];
        const source = handle.snap != GrabSnapMode.None ? handle.object : interactor.object;
        this.object.transformPointInverseWorld(grab.localAnchor, source.getPositionWorld());

        this._history.reset(this.object);
        this.initializeGrab();

        this.onGrabPointSelect.notify(this, handle);
        if (!dual) {
            this.onGrabStart.notify(this);
        }
    }

    /**
     * Programmatically release an interactable.
     *
     * @remarks
     * The interactable must be one of {@link Grabbable.handle}
     * or {@link Grabbable.handleSecondary}.
     *
     * This method is useful for grab emulation for non-VR applications.
     * In general, you will not call this method but rather rely on collision
     * checks between the {@link Interactor} and the {@link Interactable}.
     *
     * @param interactor The interactor issuing the interaction.
     * @param interactable The interactable undergoing the action.
     */
    release(interactor: Interactor) {
        const index = this._grabData.findIndex((v) => v.interactor === interactor);
        const grab = this._grabData[index];
        if (!grab) return;

        const handle = this.grabPoints[grab.handleId];
        handle._interactor = null;

        this._grabData.splice(index, 1);
        const released = !this._grabData.length;

        if (!released) {
            this.initializeGrab();
        } else if (this.canThrow) {
            this.throw(interactor);
        }

        this.onGrabPointRelease.notify(this, handle);
        if (released) {
            this.onGrabEnd.notify(this);
        }
    }

    /** `true` is any of the two handles is currently grabbed. */
    get isGrabbed(): boolean {
        return !!this.primaryGrab || !!this.secondaryGrab;
    }

    /** `true` if the primary handle is grabbed, the object pointer by {@link handle}. */
    get primaryGrab(): GrabData | null {
        return this._grabData[0];
    }

    /** `true` if the secondary handle is grabbed, the object pointer by {@link handleSecondary}. */
    get secondaryGrab(): GrabData | null {
        return this._grabData[1];
    }

    protected computeTransform(
        out: quat2,
        pivotOut: quat,
        primary: Object3D,
        secondary: Object3D | null
    ) {
        quat2.identity(out);
        quat.identity(pivotOut);

        const source = primary.getPositionWorld();
        const target = vec3.copy(TempVec3.get(), source);
        if (secondary) {
            secondary.getPositionWorld(target);
        }

        switch (this.transformType) {
            case GrabTransformType.Hand: {
                if (secondary) {
                    const interactor = this.secondaryGrab?.interactor.object ?? secondary;
                    this.transformDualHand(out, interactor, source, target);
                } else {
                    this.transformHand(out, primary);
                }
                break;
            }
            case GrabTransformType.AroundPivot: {
                const pos = vec3.lerp(TempVec3.get(), source, target, 0.5);
                this.rotationAroundPivot(out, pivotOut, pos);
                quat2.fromRotationTranslation(out, out, this.object.getPositionLocal());
                TempVec3.free();
                break;
            }
            default:
                console.warn(
                    componentError(this, `Unrecognized type ${this.transformType}`)
                );
                break;
        }

        TempVec3.free();
    }

    protected transformHand(out: quat2, source: Object3D) {
        /* `_relativeGrabTransform` is in the hand space, thus multiplyig
         * the hand transform by the object's transform leads to
         * its world space transform. */
        source.getTransformWorld(out);
        quat2.multiply(out, out, this._relativeGrabTransform);
        return out;
    }

    /**
     * Compute the transform of this grabbable based on both handles.
     */
    private transformDualHand(
        out: quat2,
        interactorUp: Object3D,
        source: vec3,
        target: vec3
    ) {
        const primaryHandle = this.grabPoints[this.primaryGrab!.handleId];

        /* Pivot */
        const up = TempVec3.get();
        if (this._useUpOrientation) {
            interactorUp.getUpWorld(up);
        } else {
            interactorUp.getForwardWorld(up);
        }

        const pivotRotation = rotateFreeDual(TempQuat.get(), source, target, up);
        quat.multiply(pivotRotation, pivotRotation, this._relativeGrabTransform as quat);
        const pivotToWorld = quat2.fromRotationTranslation(
            TempDualQuat.get(),
            pivotRotation,
            source
        );

        /* Object to handle */

        const objectToPivotVec = vec3.subtract(
            TempVec3.get(),
            this.object.getPositionWorld(),
            primaryHandle.object.getPositionWorld()
        );
        const objectToPivot = quat2.fromTranslation(out, objectToPivotVec);
        quat2.multiply(objectToPivot, objectToPivot, pivotToWorld);

        TempVec3.free(2);
        TempDualQuat.free();
        TempQuat.free();

        return out;
    }

    /**
     * Rotate the grabable around an origin.
     *
     * @param out Destination quaternion
     * @param positionWorld Anchor point, in **world space**.
     */
    protected rotationAroundPivot(out: quat, pivotOut: quat, positionWorld: vec3) {
        const localPos = computeLocalPositionForPivot(
            TempVec3.get(),
            this.object,
            positionWorld
        );
        vec3.normalize(localPos, localPos);
        vec3.scale(localPos, localPos, this.invertRotation ? -1 : 1);
        rotateAroundPivot(out, axis(this.pivotAxis), localPos);
        quat.multiply(out, out, this._relativeGrabTransform as quat);
        TempVec3.free();

        if (!this.secondaryPivot) {
            quat.identity(pivotOut);
            return;
        }

        const pos = computeLocalPositionForPivot(
            TempVec3.get(),
            this.secondaryPivot,
            positionWorld
        );
        vec3.normalize(pos, pos);
        vec3.scale(pos, pos, this.invertRotation ? -1 : 1);
        rotateAroundPivot(pivotOut, axis(this.secondaryPivotAxis), pos);
        quat.multiply(pivotOut, pivotOut, this._pivotGrabTransform as quat);
        TempVec3.free();
    }

    /**
     * Initialize single hand grab
     *
     * @note Triggered when single grab occurs, or when second hand is released.
     */
    protected initializeGrab() {
        this._setKinematicState(true);
        this._lerp = true;

        quat2.identity(this._relativeGrabTransform);
        quat.identity(this._pivotGrabTransform);

        const primaryHandle = this.grabPoints[this._grabData[0].handleId];
        const primaryInteractor = this._grabData[0].interactor.object;

        /* Switch between handle or interactor for snapping */
        const source =
            primaryHandle.snap != GrabSnapMode.None
                ? primaryHandle.object
                : primaryInteractor;

        let secondaryInteractor: Object3D | null = null;
        let target: Object3D | null = null;
        if (this._grabData.length > 1) {
            const secondaryHandle = this.grabPoints[this._grabData[1].handleId];
            secondaryInteractor = this._grabData[1].interactor.object;

            target =
                secondaryHandle.snap != GrabSnapMode.None
                    ? secondaryHandle.object
                    : secondaryInteractor;

            const interactorUp = secondaryInteractor!.getUpWorld(TempVec3.get());
            this._useUpOrientation = vec3.dot(interactorUp, UP) >= 0.5;
            TempVec3.free();
        }

        /* Do not use `_relativeGrabTransform` and `_pivotGrabTransform` directly.
         * The inner computation relies on those variables, we want them to be identity at this point. */

        const transform = TempDualQuat.get();
        const pivotTransform = TempDualQuat.get();
        this.computeTransform(transform, pivotTransform, source, target);

        const current = quat2.create();
        if (this._computeWorldSpace) {
            this.object.getTransformWorld(current);
        } else {
            this.object.getTransformLocal(current);
        }
        computeRelativeTransform(this._relativeGrabTransform as quat, current, transform);

        const pivotCurrent = quat2.create();
        this.secondaryPivot?.getRotationLocal(pivotCurrent);
        computeRelativeTransform(this._pivotGrabTransform, pivotCurrent, pivotTransform);

        TempDualQuat.free(2);
    }

    private _setKinematicState(enable: boolean) {
        if (!this._physx) return;
        if (enable === this._physx.kinematic) return;

        this._physx.kinematic = enable;
        /* Required to change the physx object state */
        this._physx.active = false;
        this._physx.active = true;
    }
}
