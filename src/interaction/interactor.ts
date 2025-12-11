import {vec3} from 'gl-matrix';
import {
    CollisionComponent,
    CollisionEventType,
    Component,
    Emitter,
    MeshComponent,
    Object3D,
    PhysXComponent,
    Scene,
} from '@wonderlandengine/api';
import {property} from '@wonderlandengine/api/decorators.js';

import {Grabbable} from './grabbable.js';
import {GrabSearchMode, GrabPoint} from './grab-point.js';
import {setComponentsActive} from '../utils/activate-children.js';

/** Represents whether the user's left or right hand is being used. */
export enum Handedness {
    Left = 0,
    Right,
}

export enum InteractorVisualState {
    None = 0,
    Visible,
    Hidden,
}
export const InteractorVisualStateNames = ['None', 'Visible', 'Hidden'];

/**
 * Manages interaction capabilities of a VR controller or a similar input device.
 *
 * The `Interactor` class enables an entity to grip or interact with objects that
 * implement the {@link Interactable} interface.
 */
export class Interactor extends Component {
    static TypeName = 'interactor';

    /** Properties. */

    /**
     * If `true`, automatically setup events from gamepad.
     * Set this to `false` to use your own input mappings or
     * gamepad library.
     */
    @property.bool(true)
    public useDefaultInputs = true;

    /** Handedness value. Compare against {@link Handedness}. */
    @property.enum(['Left', 'Right'], Handedness.Right)
    public handedness!: number;

    @property.object()
    meshRoot: Object3D | null = null;

    @property.enum(InteractorVisualStateNames, InteractorVisualState.Visible)
    visualStateOnGrab = InteractorVisualState.Visible;

    @property.object({required: true})
    trackedSpace: Object3D = null!;

    /** Private Attributes. */

    /** Collision component of this object. */
    private _collision: CollisionComponent = null!;
    /** Physx component of this object. */
    private _physx: PhysXComponent = null!;

    /**
     * Physx collision callback index.
     *
     * @hidden
     */
    private _physxCallback: number | null = null;

    /** Cached interactable after it's gripped. */
    private _grabbable: Grabbable | null = null;

    /** Grip start emitter. */
    private readonly _onGripStart: Emitter<[Grabbable]> = new Emitter();
    /** Grip end emitter. */
    private readonly _onGripEnd: Emitter<[Grabbable]> = new Emitter();

    /** @hidden */
    private readonly _onPreRender = () => {
        if (!this.#xrInputSource) return;

        if (!this.#xrInputSource!.gripSpace) {
            this.#xrPose = null;
            return;
        }
        const pose = this.engine.xr!.frame!.getPose(
            this.#xrInputSource!.gripSpace,
            this.#referenceSpace!
        );
        this.#xrPose = pose ?? null;
    };

    #xrInputSource: XRInputSource | null = null;
    #referenceSpace: XRReferenceSpace | XRBoundedReferenceSpace | null = null;
    #xrPose: XRPose | null = null;
    #onSessionStart = this._startSession.bind(this);
    #onSessionEnd = this._endSession.bind(this);
    #currentlyCollidingWith: GrabPoint | null = null;

    /**
     * Set the collision component needed to perform
     * grab interaction
     *
     * @param collision The collision component
     *
     * @returns This instance, for chaining
     */
    start() {
        this._collision = this.object.getComponent(CollisionComponent, 0)!;
        this._physx = this.object.getComponent(PhysXComponent, 0)!;

        if (!this._collision && !this._physx) {
            throw new Error('grabber.start(): No collision or physx component found');
        }
    }

    onActivate(): void {
        this.engine.onXRSessionStart.add(this.#onSessionStart);
        this.engine.onXRSessionEnd.add(this.#onSessionEnd);

        if (!this._collision) {
            this._physxCallback = this._physx.onCollision(this.onPhysxCollision);
        }
    }

    onDeactivate(): void {
        if (this._physxCallback !== null) {
            this._physx.removeCollisionCallback(this._physxCallback);
            this._physxCallback = null;
        }
        this.engine.onXRSessionStart.add(this.#onSessionStart);
        this.engine.onXRSessionEnd.add(this.#onSessionEnd);
        this._endSession();
    }

    /**
     * Force this interactor to start interacting with the given interactable.
     *
     * @param interactable The interactable to process.
     */
    public startInteraction(interactable: Grabbable, handleId: number) {
        const handle = interactable.handles[handleId];
        if (handle.interactor) {
            if (!handle.transferable) return;
            interactable.release(handle.interactor);
        }
        handle._interactor = this;

        this._grabbable = interactable;
        interactable.grab(this, handleId);
        this._onGripStart.notify(interactable);

        let hidden = this.visualStateOnGrab === InteractorVisualState.Hidden;
        if (handle.interactorVisualState !== InteractorVisualState.None) {
            hidden = handle.interactorVisualState === InteractorVisualState.Hidden;
        }

        if (this.meshRoot && hidden) {
            setComponentsActive(this.meshRoot, false, MeshComponent);
        }
    }

    /**
     * Check for nearby interactable, and notifies one if this interactor
     * interacts with it.
     */
    public checkForNearbyInteractables() {
        // TODO: Allocation.
        const thisPosition = this.object.getPositionWorld();
        let minDistance = Number.POSITIVE_INFINITY;
        let grabbableId = null;
        let handleId = null;

        /* Prioritize collision / physx over distance grab */

        // TODO: Link from handle to grabbable would be better.
        // Just need to ensure than a handle can't be referenced by
        // 2 grabbables.

        const overlaps = this._collision ? this._collision.queryOverlaps() : null;
        let overlapHandle: GrabPoint | null = null;
        if (overlaps) {
            /** @todo: The API should instead allow to check for overlap on given objects. */
            const overlaps = this._collision.queryOverlaps();
            for (const overlap of overlaps) {
                overlapHandle = overlap.object.getComponent(GrabPoint);
                if (overlapHandle) break;
            }
        }

        if (!overlapHandle && this.#currentlyCollidingWith) {
            /** @todo: The API should instead allow to check for overlap on given objects. */
            overlapHandle = this.#currentlyCollidingWith;
        }

        /** @todo: Optimize with a typed list of handle, an octree? */
        const grabbables = this.scene.getActiveComponents(Grabbable);
        for (let i = 0; i < grabbables.length; ++i) {
            const grabbable = grabbables[i];
            for (let h = 0; h < grabbable.handles.length; ++h) {
                const handle = grabbable.handles[h];
                let dist = Number.POSITIVE_INFINITY;
                switch (handle.searchMode) {
                    case GrabSearchMode.Distance: {
                        /** @todo: Add interactor grab origin */
                        const otherPosition = handle.object.getPositionWorld();
                        dist = vec3.sqrDist(thisPosition, otherPosition);
                        break;
                    }
                    case GrabSearchMode.Overlap: {
                        dist = overlapHandle === handle ? 0.0 : dist;
                        break;
                    }
                }

                const maxDistanceSq = handle.maxDistance * handle.maxDistance;
                if (dist < maxDistanceSq && dist < minDistance) {
                    minDistance = dist;
                    grabbableId = i;
                    handleId = h;
                }
            }
        }

        if (grabbableId !== null) {
            this.startInteraction(grabbables[grabbableId], handleId!);
        }
    }

    onPhysxCollision = (type: CollisionEventType, other: PhysXComponent) => {
        const grab = other.object.getComponent(GrabPoint);
        if (!grab) return;

        if (type == CollisionEventType.TriggerTouch) {
            this.#currentlyCollidingWith = grab;
        } else if (grab === this.#currentlyCollidingWith) {
            this.#currentlyCollidingWith = null;
        }
    };

    /**
     * Force this interactor to stop interacting with the
     * currently bound interactable.
     */
    public stopInteraction() {
        if (this._grabbable && !this._grabbable.isDestroyed) {
            this._grabbable.release(this);
            this._onGripEnd.notify(this._grabbable);
        }
        this._grabbable = null;

        if (this.meshRoot && !this.meshRoot.isDestroyed) {
            setComponentsActive(this.meshRoot, true, MeshComponent);
        }
    }

    /** Notified on a grip start. */
    get onGripStart(): Emitter<[Grabbable]> {
        return this._onGripStart;
    }

    /** Notified on a grip end. */
    get onGripEnd(): Emitter<[Grabbable]> {
        return this._onGripEnd;
    }

    /**
     * Current [XR pose](https://developer.mozilla.org/en-US/docs/Web/API/XRPose).
     *
     * @remarks
     * This is only available when a XR session is started **and** during a frame, i.e.,
     * during a component's update phase.
     */
    get xrPose(): XRPose | null {
        return this.#xrPose;
    }

    /**
     * Current interactable handled by this interactor. If no interaction is ongoing,
     * this getter returns `null`.
     */
    get interactable(): Grabbable | null {
        return this._grabbable;
    }

    private _startSession(session: XRSession) {
        this.#referenceSpace =
            this.engine.xr!.referenceSpaceForType('local-floor') ??
            this.engine.xr!.referenceSpaceForType('local');

        session.addEventListener('inputsourceschange', this.#inputSourceChangedEvent);

        if (!this.useDefaultInputs) {
            return;
        }

        session.addEventListener('selectstart', this.#selectStartEvent);
        session.addEventListener('selectend', this.#selectEndEvent);

        const scene = this.scene as Scene;
        scene.onPreRender.add(this._onPreRender);
    }

    private _endSession() {
        const session = this.engine.xr?.session;
        if (session) {
            session.removeEventListener(
                'inputsourceschange',
                this.#inputSourceChangedEvent
            );
            session.removeEventListener('selectstart', this.#selectStartEvent);
            session.removeEventListener('selectend', this.#selectEndEvent);
        }
        this.#referenceSpace = null;
        this.#xrInputSource = null;
        this.stopInteraction();
        const scene = this.scene as Scene;
        scene.onPreRender.remove(this._onPreRender);
    }

    #inputSourceChangedEvent = (event: XRInputSourceChangeEvent) => {
        for (const item of event.removed) {
            if (item === this.#xrInputSource) {
                this.#xrInputSource = null;
                break;
            }
        }
        const handedness = this.handedness === Handedness.Left ? 'left' : 'right';
        for (const item of event.added) {
            if (item.handedness === handedness) {
                this.#xrInputSource = item;
                break;
            }
        }
    };

    #selectStartEvent = (event: XRInputSourceEvent) => {
        if (this.#xrInputSource === event.inputSource) {
            this.checkForNearbyInteractables();
        }
    };

    #selectEndEvent = (event: XRInputSourceEvent) => {
        if (this.#xrInputSource === event.inputSource) {
            this.stopInteraction();
        }
    };
}
