import {vec3, quat2, quat, mat4} from 'gl-matrix';
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
} from '../utils/math.js';
import {GrabPoint, GrabSnapMode} from './grab-point.js';
import {
    computeLocalPositionForPivot,
    rotateAroundPivot,
    rotateAroundPivotDual,
    rotateFreeDual,
} from './providers.js';
import {Axis, AxisNames} from '../enums.js';
import {FORWARD, RIGHT, UP} from '../constants.js';
import {TempDualQuat, TempQuat, TempVec3} from '../internal-constants.js';

/** Temporary info about grabbed target. */
export interface GrabData {
    interactor: Interactor;
    handleId: number;

    /** Local grab anchor position */
    localAnchor: vec3;
}

/* Constants */

const MAX_GRABS = 2;

/* Half a centimeter is a good enough epsilon. */
const GRAB_EPSILON_DIST = 5 / 1000;
/* 1 degree */
const GRAB_EPSILON_ANGLE = 0.01745;

export enum GrabRotationType {
    Hand = 0,
    AroundPivot,
}

export class Constraints {
    @property.bool()
    lockX: boolean = false;

    @property.bool()
    lockY: boolean = false;

    @property.bool()
    lockZ: boolean = false;

    @property.vector3(1, 1, 1)
    min!: Float32Array;

    @property.vector3(-1, -1, -1)
    max!: Float32Array;
}

function axis(axis: Axis) {
    switch (axis) {
        case Axis.X:
            return RIGHT;
        case Axis.Y:
            return UP;
        case Axis.Z:
            return FORWARD;
    }
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

    /** Properties. */

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

    /**
     * If `true`, the primary grab will be set to
     * the first grab point that has been interacted with.
     *
     * For a weapon, you generally want that option to be `false`
     * and to always set the trigger grab as the first grab point, i.e.,
     * the primary grab.
     */
    @property.bool(false)
    public autoSetPrimaryGrab = false;

    @property.enum(['Hand', 'AroundPivot'], GrabRotationType.Hand)
    public rotationType = GrabRotationType.Hand;

    /** Pivot axis used when {@link rotationType} is set to {@link GrabRotationType.AroundPivot} */
    @property.enum(AxisNames, Axis.Y)
    public pivotAxis: Axis = Axis.Y;

    /*
     * Constraint Properties
     */

    @property.record(Constraints)
    public translationConstraints: Constraints = null!;

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
    private _enablePhysx = false;

    /**
     * Default relative grab transform to apply when updating
     * the grabable transform every frame.
     * @hidden
     */
    private _defaultGrabTransform: quat2 = quat2.create();

    /**
     * Local position saved on grab start
     *
     * @hidden
     */
    private _savedLocalPosition = vec3.create();

    /**
     * @hidden
     */
    private _lerp = true;
    private _useUpOrientation: boolean = false;

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
        this._enablePhysx = this._physx?.active ?? false;
    }

    update(dt: number): void {
        if (!this._lerp) {
            for (let i = this._grabData.length - 1; i >= 0; --i) {
                const grab = this._grabData[i];
                // TODO: Remove alloc.
                const handlePosition = this.object.transformPointWorld(
                    vec3.create(),
                    grab.localAnchor
                );
                const handPosition = grab.interactor.object.getPositionWorld();
                const squaredDistance = vec3.squaredDistance(handPosition, handlePosition);
                if (squaredDistance <= this.releaseDistance * this.releaseDistance)
                    continue;
                /* Hands are too far apart, release the second handle. */
                this.release(grab.interactor);
            }
        }

        if (!this.isGrabbed) return;

        let anyGrab: GrabData | null = null;
        if (this.primaryGrab && this.secondaryGrab) {
            anyGrab = this.primaryGrab;
            this._updateTransformDoubleHand();
        } else {
            const index = this.primaryGrab ? 0 : 1;
            anyGrab = this._grabData[index];
            this._updateTransformSingleHand(index);
        }

        const xrPose = anyGrab!.interactor.xrPose;
        if (xrPose && this.useControllerVelocityData) {
            this._history.updateFromPose(
                xrPose,
                anyGrab!.interactor.trackedSpace,
                this.object,
                dt
            );
        } else {
            this._history.update(this.object, dt);
        }
    }

    enablePhysx() {
        if (this._physx) {
            this._physx.active = this._enablePhysx;
        }
    }

    disablePhysx() {
        if (this._physx) {
            this._physx.active = false;
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

        if (this._grabData.length === 1) {
            this.initializeGrab();
        } else {
            this.initializeDualGrab();
        }

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

    protected rotationAroundPivot(out: quat, positionWorld: vec3) {
        /* Use grabbable parent space for the rotation to avoid taking into account
         * the actual grabbable rotation undergoing. */
        const localPos = computeLocalPositionForPivot(
            TempVec3.get(),
            this.object,
            positionWorld
        );
        rotateAroundPivot(out, axis(this.pivotAxis), localPos);

        TempVec3.free();
        return out;
    }

    protected rotationAroundPivotDual(out: quat, primaryWorld: vec3, secondaryWorld: vec3) {
        /* Use grabbable parent space for the rotation to avoid taking into account
         * the actual grabbable rotation undergoing. */
        const primaryLocalPos = computeLocalPositionForPivot(
            TempVec3.get(),
            this.object,
            primaryWorld
        );
        const secondaryLocalPos = computeLocalPositionForPivot(
            TempVec3.get(),
            this.object,
            secondaryWorld
        );
        rotateAroundPivotDual(
            out,
            axis(this.pivotAxis),
            primaryLocalPos,
            secondaryLocalPos
        );

        TempVec3.free(2);
        return out;
    }

    /**
     * Initialize single hand grab
     *
     * @note Triggered when single grab occurs, or when second hand is released.
     */
    protected initializeGrab() {
        const grab = this._grabData[0];
        const interactor = grab.interactor.object;
        const handle = this.handles[grab.handleId];
        const source = handle.snap != GrabSnapMode.None ? handle.object : interactor;
        this._lerp = handle.snap != GrabSnapMode.None;

        this.object.getPositionLocal(this._savedLocalPosition);

        switch (this.rotationType) {
            case GrabRotationType.AroundPivot: {
                const out = this._defaultGrabTransform as quat;
                this.rotationAroundPivot(out, source.getPositionWorld());
                computeRelativeRotation(this.object.getRotationLocal(), out, out);
                break;
            }
            case GrabRotationType.Hand:
                computeRelativeTransform(this.object, source, this._defaultGrabTransform);
                break;
        }
    }

    /**
     * Initialize double hand grab
     */
    protected initializeDualGrab() {
        if (!this.autoSetPrimaryGrab && this._grabData[0].handleId !== 0) {
            /* For main grab point to be primary handle */
            const first = this._grabData[0];
            this._grabData[0] = this._grabData[1];
            this._grabData[1] = first;
        }

        const primaryHandle = this.handles[this._grabData[0].handleId];
        const primaryInteractor = this._grabData[0].interactor.object;

        const secondaryHandle = this.handles[this._grabData[1].handleId];
        const secondaryInteractor = this._grabData[1].interactor.object;

        /* Switch between handle or interactor for snapping */
        const source =
            primaryHandle.snap != GrabSnapMode.None
                ? primaryHandle.object
                : primaryInteractor;
        const target =
            secondaryHandle.snap != GrabSnapMode.None
                ? secondaryHandle.object
                : secondaryInteractor;

        const sourcePosWorld = source.getPositionWorld(TempVec3.get());
        const targetPosWorld = target!.getPositionWorld(TempVec3.get());

        switch (this.rotationType) {
            case GrabRotationType.AroundPivot: {
                this.rotationAroundPivotDual(
                    this._defaultGrabTransform as quat,
                    sourcePosWorld,
                    targetPosWorld
                );
                computeRelativeRotation(
                    this.object.getRotationLocal(),
                    this._defaultGrabTransform as quat,
                    this._defaultGrabTransform as quat
                );
                break;
            }
            case GrabRotationType.Hand: {
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
                    objectRotation,
                    handRotation,
                    this._defaultGrabTransform as quat
                );

                TempVec3.free(2);
                TempQuat.free();
                break;
            }
        }

        TempVec3.free(2);
    }

    /**
     * Compute the transform of this grabbable based on a single handle.
     *
     * @param index The index of the handle to update the transform from.
     */
    private _updateTransformSingleHand(index: number) {
        const grab = this._grabData[index]!;
        const hand = grab.interactor.object;
        const handPosition = hand.getPositionWorld();

        switch (this.rotationType) {
            case GrabRotationType.Hand: {
                /* `grab.transform` is in the hand space, thus multiplyig
                 * the hand transform by the object's transform leads to
                 * its world space transform. */
                const transform = hand.getTransformWorld(TempDualQuat.get());
                quat2.multiply(transform, transform, this._defaultGrabTransform);

                const handle = this.handles[grab.handleId];
                const lerp = this._lerp ? clamp(handle.snapLerp, 0, 1) : 1.0;

                const currentPos = this.object.getPositionWorld();
                const pos = quat2.getTranslation(vec3.create(), transform);
                vec3.lerp(pos, currentPos, pos, lerp);

                const currentRot = this.object.getRotationWorld();
                const rot = quat2.getReal(quat.create(), transform as quat);
                quat.lerp(rot, currentRot, rot, lerp);
                quat.normalize(rot, rot);
                this.object.setPositionWorld(pos);
                this.object.setRotationWorld(rot);

                if (this._lerp) {
                    this._lerp =
                        !isPointEqual(pos, currentPos, GRAB_EPSILON_DIST) ||
                        !isQuatEqual(rot, currentRot, GRAB_EPSILON_ANGLE);
                }

                TempDualQuat.free();
                break;
            }
            case GrabRotationType.AroundPivot:
                // TODO: Handle position?
                const rot = this.rotationAroundPivot(TempQuat.get(), handPosition);
                quat.multiply(rot, rot, this._defaultGrabTransform as quat);
                this.object.setRotationLocal(rot);

                TempQuat.free();
                break;
        }

        this._applyConstraints(grab);
    }

    /**
     * Compute the transform of this grabbable based on both handles.
     */
    private _updateTransformDoubleHand() {
        const primaryGrab = this._grabData[0];
        const primaryInteractor = this._grabData[0]!.interactor;
        const secondaryInteractor = this._grabData[1]!.interactor;
        const primaryWorld = primaryInteractor.object.getPositionWorld(TempVec3.get());
        const secondaryWorld = secondaryInteractor.object.getPositionWorld(TempVec3.get());

        const primaryHandle = this.handles[primaryGrab.handleId];
        const secondaryHandle = this.handles[this._grabData[1].handleId];

        switch (this.rotationType) {
            case GrabRotationType.Hand:
                {
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
                    quat.multiply(
                        pivotRotation,
                        pivotRotation,
                        this._defaultGrabTransform as quat
                    );
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
                    const objectToPivot = quat2.fromTranslation(
                        TempDualQuat.get(),
                        objectToPivotVec
                    );

                    const transform = quat2.multiply(
                        objectToPivot,
                        objectToPivot,
                        pivotToWorld
                    );
                    this.object.setTransformWorld(transform);

                    TempVec3.free(2);
                    TempDualQuat.free(2);
                    TempQuat.free();

                    this._applyConstraints(primaryGrab);
                }
                break;
            case GrabRotationType.AroundPivot:
                {
                    const rot = this.rotationAroundPivotDual(
                        TempQuat.get(),
                        primaryWorld,
                        secondaryWorld
                    );
                    quat.multiply(rot, rot, this._defaultGrabTransform as quat);
                    this.object.setRotationLocal(rot);

                    TempQuat.free();
                }
                break;
        }

        TempVec3.free(2);
    }

    private _applyConstraints(grab: GrabData) {
        // TODO: Constraint rotation

        if (
            !this.translationConstraints.lockX &&
            !this.translationConstraints.lockY &&
            !this.translationConstraints.lockZ
        ) {
            return;
        }

        const localPos = this.object.getPositionLocal(TempVec3.get());

        const min = this.translationConstraints.min;
        const max = this.translationConstraints.max;
        const validX = min[0] < max[0];
        const validY = min[1] < max[1];
        const validZ = min[2] < max[2];

        const bounds = vec3.set(
            TempVec3.get(),
            validX ? min[0] : Number.NEGATIVE_INFINITY,
            validY ? min[1] : Number.NEGATIVE_INFINITY,
            validZ ? min[2] : Number.NEGATIVE_INFINITY
        );
        vec3.max(localPos, localPos, bounds);

        vec3.set(
            bounds,
            validX ? max[0] : Number.POSITIVE_INFINITY,
            validY ? max[1] : Number.POSITIVE_INFINITY,
            validZ ? max[2] : Number.POSITIVE_INFINITY
        );
        vec3.min(localPos, localPos, bounds);

        if (this.translationConstraints.lockX) {
            localPos[0] = this._savedLocalPosition[0];
        }
        if (this.translationConstraints.lockY) {
            localPos[1] = this._savedLocalPosition[1];
        }
        if (this.translationConstraints.lockZ) {
            localPos[2] = this._savedLocalPosition[2];
        }

        this.object.setPositionLocal(localPos);

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
