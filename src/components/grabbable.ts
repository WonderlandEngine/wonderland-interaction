import {vec3, quat2, quat} from 'gl-matrix';
import {
    Component,
    Emitter,
    Object3D,
    PhysXComponent,
    Property,
    PropertyRecord,
    WonderlandEngine,
} from '@wonderlandengine/api';
import {property} from '@wonderlandengine/api/decorators.js';

import {Interactor} from './interactor.js';
import {HistoryTracker} from '../history-tracker.js';
import {computeRelativeTransform} from '../utils/math.js';
import {GrabPoint} from './interaction/grab-point.js';

/** Temporary info about grabbed target. */
export interface GrabData {
    interactor: Interactor;
    handleId: number;
    /** Local transform in **interactor** space */
    transform: quat2;
}

const MAX_GRABS = 2;

/** Temporaries. */
const _pointA = vec3.create();
const _pointB = vec3.create();
const _pointC = vec3.create();
const _vectorA = vec3.create();
const _vectorB = vec3.create();
const _vectorC = vec3.create();
const _rotation = quat.create();
const _transform = quat2.create();

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

    handles: GrabPoint[] = [];

    /** Private Attributes. */

    /** Cached currently grabbed data. */
    private _grabData: GrabData[] = [];

    /** Squared distance between both handle cached when starting a double grab. */
    private _maxSqDistance: number | null = null;
    private _history: HistoryTracker = new HistoryTracker();
    private _physx: PhysXComponent | null = null;
    private _enablePhysx = false;

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
        this.handles = this.handleObjects.map((o) => o.getComponent(GrabPoint)!);
        if (this.handles.length === 0) {
            const handle =
                this.object.getComponent(GrabPoint) ?? this.object.addComponent(GrabPoint);
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
        if (!this.isGrabbed) {
            return;
        }

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
            this._history.updateFromPose(xrPose, this.object, dt);
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
        this._physx.active = true;

        const angular = this._history.angular(_vectorA);
        vec3.scale(angular, angular, this.throwAngularIntensity);

        const velocity = this._history.velocity(_vectorB);
        vec3.scale(velocity, velocity, this.throwLinearIntensity);

        const radius = vec3.subtract(
            _vectorC,
            this.object.getPositionWorld(_pointA),
            interactor.object.getPositionWorld(_pointB)
        );
        vec3.cross(radius, angular, radius);
        vec3.add(velocity, velocity, radius);

        this._physx.angularVelocity = angular;
        this._physx.linearVelocity = velocity;
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

        const grab = {interactor, handleId, transform: quat2.create()};
        this._grabData.push(grab);

        const handle = this.handles[handleId];
        if (handle.shouldSnap) {
            computeRelativeTransform(this.object, handle.object, grab.transform);
        } else {
            computeRelativeTransform(this.object, interactor.object, grab.transform);
        }

        this._history.reset(this.object);
        if (this._physx) {
            this._physx.active = false;
        }

        if (this.primaryGrab && this.secondaryGrab) {
            const primary = this.handles[this.primaryGrab.handleId];
            const secondary = this.handles[this.secondaryGrab.handleId];
            /* Cache the grabbing distance between both handles. */
            this._maxSqDistance = vec3.squaredDistance(
                primary.object.getPositionWorld(_pointA),
                secondary.object.getPositionWorld(_pointB)
            );
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

        const otherGrab = index === 0 ? this._grabData[1] : this._grabData[0];
        if (otherGrab) {
            /* If only one handle is released, we need to store the current transform
             * into the remaining grab data to avoid having an inconsistent single grab. */
            const interactor = otherGrab.interactor.object;
            computeRelativeTransform(this.object, interactor, otherGrab.transform);
        }

        this._grabData.splice(index, 1);
        this._maxSqDistance = null;

        if (this.canThrow && !this.isGrabbed) {
            this.throw(interactor);
        }

        this._onGrabEnd.notify(this);
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

    /**
     * Compute the transform of this grabbable based on a single handle.
     *
     * @param index The index of the handle to update the transform from.
     */
    private _updateTransformSingleHand(index: number) {
        const grab = this._grabData[index]!;
        const hand = grab.interactor.object;

        /* `grab.transform` is in the hand space, thus multiplyig
         * the hand transform by the object's transform leads to
         * its world space transform. */
        const transform = hand.getTransformWorld(_transform);
        quat2.multiply(transform, transform, grab.transform);

        this.object.setTransformWorld(transform);
    }

    /**
     * Compute the transform of this grabbable based on both handles.
     */
    private _updateTransformDoubleHand() {
        const primaryInteractor = this._grabData[0]!.interactor;
        const secondaryInteractor = this._grabData[1]!.interactor;
        const primaryWorld = primaryInteractor.object.getPositionWorld(_pointA);
        const secondaryWorld = secondaryInteractor.object.getPositionWorld(_pointB);

        const squaredDistance = vec3.squaredDistance(primaryWorld, secondaryWorld);
        if (squaredDistance > this._maxSqDistance! * 2.0) {
            /* Hands are too far apart, release the second handle. */
            this.release(secondaryInteractor);
            return;
        }

        /* Rotate the grabbable from first handle to secondary. */
        const dir = vec3.subtract(_vectorA, secondaryWorld, primaryWorld);
        vec3.normalize(dir, dir);
        const rotation = quat.rotationTo(_rotation, [0, 0, -1], dir);
        this.object.setRotationWorld(rotation);

        const primaryHandle = this.handles[this.primaryGrab!.handleId];

        /* Translate using the distance from the grabbable to the first handle */
        const translation = vec3.sub(
            _vectorA,
            this.object.getPositionWorld(_pointB),
            primaryHandle.object.getPositionWorld(_pointC)
        );
        vec3.add(translation, translation, primaryWorld);
        this.object.setPositionWorld(translation);
    }
}
