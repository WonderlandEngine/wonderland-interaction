import {vec3, quat} from 'gl-matrix';
import {
    Component,
    Object,
    Object3D,
    PhysXComponent,
    WonderlandEngine,
} from '@wonderlandengine/api';
import {property} from '@wonderlandengine/api/decorators.js';

import {Interactor} from './interactor.js';
import {Interactable} from './interactable.js';
import {HistoryTracker} from '../history-tracker.js';

export interface GrabData {
    interactor: Interactor;
    offsetTrans: vec3;
    offsetRot: quat;
}

function setupRotationOffset(data: GrabData, target: Object) {
    const srcRot = quat.copy(quat.create(), data.interactor.object.rotationWorld);
    const targetRot = target.rotationWorld;
    // Detla = to * inverse(from).
    quat.multiply(data.offsetRot, quat.invert(srcRot, srcRot), targetRot);
    quat.normalize(data.offsetRot, data.offsetRot);
}

type InteractorCb = (interactable: Interactor) => void;

/**
 * Grabbable object.
 */
export class Grabbable extends Component {
    /** @override */
    static TypeName = 'grabbable';

    /**
     * Public Attributes.
     */

    @property.object()
    public handle: Object = null!;

    @property.object()
    public handleSecondary: Object = null!;

    @property.bool(true)
    /**
     * Whether the object can be thrown with physics or not.
     *
     * When the interactor releases this grabbable, it will be thrown based on
     * the velocity the interactor had.
     */
    public canThrow: boolean = true;

    @property.float(1.0)
    public throwLinearIntensity: number = 1.0;
    public throwAngularIntensity: number = 1.0;

    @property.object()
    public distanceMarker: Object3D | null = null;
    @property.int(0)
    public distanceHandle: number = 0;
    @property.float(1.0)
    public distanceSpeed: number = 1.0;

    /**
     * Private Attributes.
     */

    private _interactable: Interactable[] = new Array(2);
    private _grabData: (GrabData | null)[] = new Array(2);
    private _maxSqDistance: number | null = null;

    private _startObservers: InteractorCb[] = new Array(2);
    private _stopObservers: InteractorCb[] = new Array(2);

    private _history: HistoryTracker = new HistoryTracker();

    private _physx: PhysXComponent | null = null;

    private _enablePhysx: boolean = false;

    constructor(engine: WonderlandEngine) {
        super(engine);

        for (let i = 0; i < 2; ++i) {
            this._grabData[i] = null;
            ((index: number) => {
                this._startObservers[i] = (interactor: Interactor) =>
                    this.onInteractionStart(interactor, index);
                this._stopObservers[i] = (interactor: Interactor) =>
                    this._onInteractionStop(interactor, index);
            })(i);
        }
    }

    start(): void {
        if (!this.handle) {
            throw new Error('Grabbable.start(): `handle` property must be set.');
        }

        this._interactable[0] = this.handle.getComponent(Interactable)!;
        if (!this._interactable[0]) {
            throw new Error(
                `Grabbable.start(): 'handle' must have an Interactable component.`
            );
        }

        /* The second handle is optional. */
        if (this.handleSecondary) {
            this._interactable[1] = this.handleSecondary.getComponent(Interactable)!;
            if (!this._interactable[1]) {
                throw new Error(
                    `Grabbable.start(): 'handleSecondary' must have an Interactable component.`
                );
            }
        }
        this._physx = this.object.getComponent('physx');
    }

    onActivate(): void {
        for (let i = 0; i < 2; ++i) {
            const interactable = this._interactable[i];
            if (interactable) {
                interactable.onSelectStart.add(this._startObservers[i]);
                interactable.onSelectEnd.add(this._stopObservers[i]);
            }
        }
        this._enablePhysx = this._physx?.active ?? false;
    }

    onDeactivate(): void {
        for (let i = 0; i < 2; ++i) {
            const interactable = this._interactable[i];
            if (interactable) {
                interactable.onSelectStart.remove(this._startObservers[i]);
                interactable.onSelectEnd.remove(this._stopObservers[i]);
            }
        }
    }

    update(dt: number): void {
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
        if (xrPose) {
            this._history.updateFromPose(xrPose, this.object, dt);
        } else {
            this._history.update(this.object, dt);
        }
    }

    onInteractionStart(interactor: Interactor, index: number): void {
        if (this._grabData[index]) return;

        const grab: GrabData = {
            interactor,
            offsetTrans: vec3.create(),
            offsetRot: quat.create(),
        };

        const interactable = this._interactable[index];
        const local = interactable.object.getTranslationLocal(vec3.create());
        vec3.scale(grab.offsetTrans, local, -1);

        if (interactable.snap) {
            quat.copy(grab.offsetRot, interactable.object.rotationLocal);
        } else {
            setupRotationOffset(grab, this.object);
        }

        this._grabData[index] = grab;
        this._history.reset(this.object);
        if (this._physx) this._physx.active = false;

        if (this.primaryGrab && this.secondaryGrab) {
            this._maxSqDistance = vec3.squaredDistance(
                this._interactable[0].object.getTranslationWorld(vec3.create()),
                this._interactable[1].object.getTranslationWorld(vec3.create())
            );
        }
    }

    enablePhysx() {
        if (this._physx) this._physx.active = this._enablePhysx;
    }

    disablePhysx() {
        if (this._physx) this._physx.active = false;
    }

    throw(): void {
        if (!this._physx) return;

        const angular = this._history.angular(vec3.create());
        vec3.scale(angular, angular, this.throwAngularIntensity);

        const radius = vec3.create();
        vec3.subtract(
            radius,
            this.object.getTranslationWorld(vec3.create()),
            // @todo: How to deal with that for 2 hands?
            this._interactable[0].object.getTranslationWorld(vec3.create())
        );

        const velocity = this._history.velocity(vec3.create());
        vec3.add(velocity, velocity, vec3.cross(vec3.create(), angular, radius));
        vec3.scale(velocity, velocity, this.throwLinearIntensity);

        this._physx.active = true;
        this._physx.linearVelocity = velocity;
        this._physx.angularVelocity = angular;
    }

    getInteractable(index: number): Interactable {
        return this._interactable[index];
    }

    get isGrabbed(): boolean {
        return !!this.primaryGrab || !!this.secondaryGrab;
    }

    get primaryGrab(): GrabData | null {
        return this._grabData[0];
    }

    get secondaryGrab(): GrabData | null {
        return this._grabData[1];
    }

    private _onInteractionStop(interactor: Interactor, index: number): void {
        const grab = this._grabData[index];
        if (!grab || interactor !== grab.interactor) return;

        const secondaryGrab = index === 0 ? this._grabData[1] : this._grabData[0];
        if (secondaryGrab) {
            setupRotationOffset(secondaryGrab, this.object);
        }

        this._grabData[index] = null;
        this._maxSqDistance = null;

        if (this.canThrow && !this.isGrabbed) {
            this.throw();
        }
    }

    private _onDistanceGrab(interactor: Interactor, index: number): void {
        console.log('CALLLED');
    }

    private _updateTransformSingleHand(index: number) {
        const grab = this._grabData[index]!;
        const interactor = grab.interactor;
        // const interactable = this._interactable[index];

        const rotation = quat.copy(quat.create(), interactor.object.rotationWorld);
        quat.multiply(rotation, rotation, grab.offsetRot);

        this.object.resetRotation();
        this.object.rotationWorld = rotation;
        // this.object.rot(grab.offsetRot);

        const world = interactor.object.getTranslationWorld(vec3.create());
        this.object.setTranslationWorld(world);
        this.object.translateObject(grab.offsetTrans);
    }

    private _updateTransformDoubleHand() {
        const primaryGrab = this._grabData[0] as GrabData;
        const primaryInteractor = primaryGrab.interactor;
        const secondaryInteractor = this._grabData[1]!.interactor;

        const primaryWorld = primaryInteractor.object.getTranslationWorld(vec3.create());
        const secondaryWorld = secondaryInteractor.object.getTranslationWorld(
            vec3.create()
        );

        if (
            vec3.squaredDistance(primaryWorld, secondaryWorld) >
            this._maxSqDistance! * 2.0
        ) {
            /* Detach second hand when grabbing distance is too big. */
            this._onInteractionStop(secondaryInteractor, 1);
            return;
        }

        this.object.setTranslationWorld(primaryWorld);
        this.object.translateObject(primaryGrab.offsetTrans);

        const dir = vec3.subtract(vec3.create(), secondaryWorld, primaryWorld);
        vec3.normalize(dir, dir);
        vec3.scale(dir, dir, 100.0);

        this.object.lookAt(vec3.add(vec3.create(), primaryWorld, dir));
    }
}
