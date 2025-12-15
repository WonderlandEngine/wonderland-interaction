import {vec3, quat2, quat, mat4, vec4} from 'gl-matrix';
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
import {
    computeRelativeRotation,
    computeRelativeTransform,
    isPointEqual,
    isQuatEqual,
    toRad,
} from '../utils/math.js';
import {GrabPoint, GrabSnapMode} from './grab-point.js';
import {
    computeLocalPositionForPivot,
    rotateAroundPivot,
    rotateFreeDual,
} from './providers.js';
import {FORWARD, RIGHT, UP} from '../constants.js';
import {TempDualQuat, TempQuat, TempVec3} from '../internal-constants.js';

/* Constants */

const MAX_GRABS = 2;
const GRAB_EPSILON_DIST = 0.005; /* Half centimeter. */
const GRAB_EPSILON_ANGLE = toRad(0.5); /* Half a degree */

export enum GrabRotationType {
    Hand = 0,
    AroundPivot,
}
const GrabRotationTypeNames = ['Hand', 'AroundPivot'];

export enum GrabPositionType {
    None = 0,
    Hand = 1,
}
const GrabPositionTypeNames = ['None', 'Hand'];

export enum PivotAxis {
    X = 0,
    Y,
    Z,
}
export const PivotAxisNames = ['X', 'Y', 'Z'];

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

    static onRegister(engine: WonderlandEngine) {
        engine.registerComponent(GrabPoint);
    }

    /** Properties */

    /**
     * Main handle.
     *
     * @remarks
     * If no handle is provided, this component will treat the component
     * it's attached to as the {@link Interactable}.
     *
     * This is an Object3D containing an {@link Interactable} component.
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

    @property.enum(GrabPositionTypeNames, GrabPositionType.Hand)
    public positionType = GrabPositionType.Hand;

    @property.enum(GrabRotationTypeNames, GrabRotationType.Hand)
    public rotationType = GrabRotationType.Hand;

    /** Pivot axis used when {@link rotationType} is set to {@link GrabRotationType.AroundPivot} */
    @property.enum(PivotAxisNames, PivotAxis.Y)
    public pivotAxis: PivotAxis = PivotAxis.Y;

    @property.object()
    public secondaryPivot: Object3D | null = null;

    /** Pivot axis used when {@link rotationType} is set to {@link GrabRotationType.AroundPivot} */
    @property.enum(PivotAxisNames, PivotAxis.Y)
    public secondaryPivotAxis: PivotAxis = PivotAxis.Y;

    @property.bool(false)
    public invertRotation = false;

    /** Public Attributes */

    handles: GrabPoint[] = [];

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
     * Default relative grab transform to apply when updating
     * the grabable transform every frame.
     * @hidden
     */
    private _defaultGrabTransform: quat2 = quat2.create();

    private _pivotGrabTransform = quat.create();

    /** @hidden */
    private _useUpOrientation: boolean = false;

    private _computeWorldSpace = false;

    private _lerp = false;

    /**
     * Emitter for the grab start event.
     * This event is triggered when an interactable object is grabbed.
     *
     * This property is a readonly backing field for {@link onGrabStart}.
     *
     * @remarks
     * The notification occurs if any of the two interactables is grabbed
     */
    private readonly _onGrabStart: Emitter<[this]> = new Emitter();

    /**
     * Emitter for the grab end event.
     * This event is triggered when an interactable object is released, thus the grabbing ended.
     *
     * This property is a readonly backing field for {@link onGrabEnd}.
     *
     */
    private readonly _onGrabEnd: Emitter<[this]> = new Emitter();

    init() {
        this.handles = this.handleObjects.map((o) => {
            return o.getComponent(GrabPoint) ?? o.addComponent(GrabPoint)!;
        });
        if (this.handles.length === 0) {
            const handle =
                this.object.getComponent(GrabPoint) ?? this.object.addComponent(GrabPoint)!;
            this.handles.push(handle);
        }
    }

    start(): void {
        this._physx = this.object.getComponent('physx');
    }

    onActivate(): void {
        this._computeWorldSpace = this.rotationType === GrabRotationType.Hand;
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

        switch (this.rotationType) {
            case GrabRotationType.Hand: {
                const transform = this.transformHand(TempDualQuat.get(), 0);
                quat2.getTranslation(position, transform);
                quat2.getReal(rotation, transform as quat);
                TempDualQuat.free();
                break;
            }
            case GrabRotationType.AroundPivot: {
                const pos = this.computeInteractorsCenterPosition(TempVec3.get());
                const pivotRot = TempQuat.get();
                this.rotationAroundPivot(rotation, pivotRot, pos);
                quat.multiply(rotation, rotation, this._defaultGrabTransform as quat);

                if (this.secondaryPivot) {
                    quat.multiply(pivotRot, pivotRot, this._pivotGrabTransform as quat);
                    this.secondaryPivot.setRotationLocal(pivotRot);
                }

                TempVec3.free();
                TempQuat.free();
                break;
            }
        }
        quat.normalize(rotation, rotation);

        if (this._lerp) {
            const primaryHandle = this.handles[this.primaryGrab!.handleId];
            let lerp = primaryHandle.snapLerp;
            if (this.secondaryGrab) {
                const secondaryHandle = this.handles[this.secondaryGrab.handleId];
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

        const xrPose = this.primaryGrab!.interactor.xrPose;
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

        const handle = this.handles[handleId];
        const source = handle.snap != GrabSnapMode.None ? handle.object : interactor.object;
        this.object.transformPointInverseWorld(grab.localAnchor, source.getPositionWorld());

        this._history.reset(this.object);
        this._setKinematicState(true);

        if (this._grabData.length > 1 && handleId === 0) {
            /* Ensure primary grab is always first */
            const second = this._grabData[0];
            this._grabData[0] = this._grabData[1];
            this._grabData[1] = second;
        }

        this.initializeGrab();
        this._onGrabStart.notify(this);
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

        const handle = this.handles[grab.handleId];
        handle._interactor = null;

        this._grabData.splice(index, 1);

        if (this._grabData.length) {
            this.initializeGrab();
        } else if (this.canThrow) {
            this.throw(interactor);
            this._onGrabEnd.notify(this);
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

    /** Notified on a select start. */
    get onGrabStart(): Emitter<[this]> {
        return this._onGrabStart;
    }

    /** Notified on a select end. */
    get onGrabEnd(): Emitter<[this]> {
        return this._onGrabEnd;
    }

    protected transformHand(out: quat2, index: number) {
        const grab = this._grabData[index]!;
        const hand = grab.interactor.object;

        /* `_defaultGrabTransform` is in the hand space, thus multiplyig
         * the hand transform by the object's transform leads to
         * its world space transform. */
        hand.getTransformWorld(out);
        quat2.multiply(out, out, this._defaultGrabTransform);
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
        TempVec3.free();

        quat.identity(pivotOut);
        if (!this.secondaryPivot) return;

        const pos = computeLocalPositionForPivot(
            TempVec3.get(),
            this.secondaryPivot,
            positionWorld
        );
        vec3.normalize(pos, pos);
        vec3.scale(pos, pos, this.invertRotation ? -1 : 1);
        rotateAroundPivot(pivotOut, axis(this.secondaryPivotAxis), pos);
        TempVec3.free();
    }

    protected computeInteractorsCenterPosition(out: vec3) {
        this.primaryGrab!.interactor.object.getPositionWorld(out);

        const secondary = this.secondaryGrab?.interactor.object;
        if (!secondary) return out;

        const secondPos = secondary.getPositionWorld(TempVec3.get());
        vec3.lerp(out, out, secondPos, 0.5);
        TempVec3.free();

        return out;
    }

    /**
     * Initialize single hand grab
     *
     * @note Triggered when single grab occurs, or when second hand is released.
     */
    protected initializeGrab() {
        this._lerp = true;

        quat2.identity(this._defaultGrabTransform);
        quat.identity(this._pivotGrabTransform);

        const primaryHandle = this.handles[this._grabData[0].handleId];
        const primaryInteractor = this._grabData[0].interactor.object;

        /* Switch between handle or interactor for snapping */
        const source =
            primaryHandle.snap != GrabSnapMode.None
                ? primaryHandle.object
                : primaryInteractor;

        const sourcePosWorld = source.getPositionWorld(TempVec3.get());
        const targetPosWorld: vec3 = vec3.copy(TempVec3.get(), sourcePosWorld);

        let secondaryInteractor: Object3D | null = null;
        if (this._grabData.length > 1) {
            const secondaryHandle = this.handles[this._grabData[1].handleId];
            secondaryInteractor = this._grabData[1].interactor.object;

            const target =
                secondaryHandle.snap != GrabSnapMode.None
                    ? secondaryHandle.object
                    : secondaryInteractor;

            target.getPositionWorld(targetPosWorld);
        }

        switch (this.rotationType) {
            case GrabRotationType.Hand: {
                if (secondaryInteractor) {
                    const interactorUp = secondaryInteractor!.getUpWorld(TempVec3.get());
                    const up = TempVec3.get();
                    this._useUpOrientation = vec3.dot(interactorUp, UP) >= 0.5;
                    if (this._useUpOrientation) {
                        vec3.copy(up, interactorUp);
                    } else {
                        secondaryInteractor.getForwardWorld(up);
                    }

                    const handRotation = rotateFreeDual(
                        sourcePosWorld,
                        targetPosWorld,
                        up,
                        this._defaultGrabTransform as quat
                    );

                    const objectRotation = this.object.getRotationWorld(TempQuat.get());
                    computeRelativeRotation(
                        this._defaultGrabTransform as quat,
                        objectRotation,
                        handRotation
                    );

                    TempVec3.free(2);
                    TempQuat.free();
                } else {
                    computeRelativeTransform(
                        this._defaultGrabTransform,
                        this.object,
                        source
                    );
                }
                break;
            }
            case GrabRotationType.AroundPivot: {
                const rot = this.object.getRotationLocal();
                const pivotRot = quat.create();

                const pos = TempVec3.get();
                vec3.lerp(pos, sourcePosWorld, targetPosWorld, 0.5);

                this.secondaryPivot?.getRotationLocal(pivotRot);
                this.rotationAroundPivot(
                    this._defaultGrabTransform,
                    this._pivotGrabTransform,
                    pos
                );
                computeRelativeRotation(
                    this._defaultGrabTransform,
                    rot,
                    this._defaultGrabTransform
                );
                computeRelativeRotation(
                    this._pivotGrabTransform,
                    pivotRot,
                    this._pivotGrabTransform
                );

                TempVec3.free(1);
                break;
            }
        }

        TempVec3.free(2);
    }

    /**
     * Compute the transform of this grabbable based on both handles.
     */
    private _updateTransformDoubleHand() {
        if (this.rotationType !== GrabRotationType.Hand) return;

        const primaryGrab = this._grabData[0];
        const primaryInteractor = this._grabData[0]!.interactor;
        const secondaryInteractor = this._grabData[1]!.interactor;
        const primaryWorld = primaryInteractor.object.getPositionWorld(TempVec3.get());
        const secondaryWorld = secondaryInteractor.object.getPositionWorld(TempVec3.get());

        const primaryHandle = this.handles[primaryGrab.handleId];

        /* Pivot */
        const up = TempVec3.get();
        if (this._useUpOrientation) {
            secondaryInteractor.object.getUpWorld(up);
        } else {
            secondaryInteractor.object.getForwardWorld(up);
        }

        const pivotRotation = rotateFreeDual(
            primaryWorld,
            secondaryWorld,
            up,
            TempQuat.get()
        );
        quat.multiply(pivotRotation, pivotRotation, this._defaultGrabTransform as quat);
        const pivotToWorld = quat2.fromRotationTranslation(
            TempDualQuat.get(),
            pivotRotation,
            primaryWorld
        );

        // TODO: Lerp second hand.

        /* Object to handle */

        const objectToPivotVec = vec3.subtract(
            TempVec3.get(),
            this.object.getPositionWorld(),
            primaryHandle.object.getPositionWorld()
        );
        const objectToPivot = quat2.fromTranslation(TempDualQuat.get(), objectToPivotVec);

        const transform = quat2.multiply(objectToPivot, objectToPivot, pivotToWorld);
        this.object.setTransformWorld(transform);

        TempVec3.free(2);
        TempDualQuat.free(2);
        TempQuat.free();

        TempVec3.free(2);
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
