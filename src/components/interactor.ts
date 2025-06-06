import {
    CollisionComponent,
    CollisionEventType,
    Component,
    Emitter,
    PhysXComponent,
    Scene,
} from '@wonderlandengine/api';
import {property} from '@wonderlandengine/api/decorators.js';
import {Grabbable} from './grabbable.js';
import {GrabSearchMode, GrabPoint} from './interaction/grab-point.js';
import {vec3} from 'gl-matrix';

/** Represents whether the user's left or right hand is being used. */
export enum Handedness {
    Right = 'right',
    Left = 'left',
}

/** An array of available handedness values. */
export const HandednessValues = Object.values(Handedness);

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
    @property.enum(HandednessValues, Handedness.Right)
    public handedness!: number;

    /** Private Attributes. */

    /** Collision component of this object. */
    private _collision: CollisionComponent = null!;
    /** Physx component of this object. */
    private _physx: PhysXComponent = null!;

    /** Cached interactable after it's gripped. */
    private _interactable: Grabbable | null = null;

    /** Grip start emitter. */
    private readonly _onGripStart: Emitter<[Grabbable]> = new Emitter();
    /** Grip end emitter. */
    private readonly _onGripEnd: Emitter<[Grabbable]> = new Emitter();

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
    #currentlyCollidingWith: PhysXComponent | null = null;

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
        if (!this._collision) {
            this._physx.onCollision(this.onPhysxCollision);
        }
    }

    onActivate(): void {
        this.engine.onXRSessionStart.add(this.#onSessionStart);
        this.engine.onXRSessionEnd.add(this.#onSessionEnd);
    }

    onDeactivate(): void {
        this.engine.onXRSessionStart.add(this.#onSessionStart);
        this.engine.onXRSessionEnd.add(this.#onSessionEnd);
    }

    /**
     * Force this interactor to start interacting with the given interactable.
     *
     * @param interactable The interactable to process.
     */
    public startInteraction(interactable: Grabbable, handle: number) {
        this._interactable = interactable;
        interactable.grab(this, handle);
        this._onGripStart.notify(interactable);
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
            overlapHandle = this.#currentlyCollidingWith.object.getComponent(GrabPoint);
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
        console.log(`${type}: ${other.object.name}`);
        if (type == CollisionEventType.TriggerTouch) {
            this.#currentlyCollidingWith = other;
        } else {
            this.#currentlyCollidingWith = null;
        }
    };

    /**
     * Force this interactor to stop interacting with the
     * currently bound interactable.
     */
    public stopInteraction() {
        if (this._interactable) {
            this._interactable.release(this);
            this._onGripEnd.notify(this._interactable);
        }
        this._interactable = null;
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
        return this._interactable;
    }

    private _startSession(session: XRSession) {
        this.#referenceSpace =
            this.engine.xr!.referenceSpaceForType('local-floor') ??
            this.engine.xr!.referenceSpaceForType('local');

        session.addEventListener('inputsourceschange', (event) => {
            for (const item of event.removed) {
                if (item === this.#xrInputSource) {
                    this.#xrInputSource = null;
                    break;
                }
            }
            const handedness = HandednessValues[this.handedness];
            for (const item of event.added) {
                if (item.handedness === handedness) {
                    this.#xrInputSource = item;
                    break;
                }
            }
        });

        if (!this.useDefaultInputs) {
            return;
        }

        session.addEventListener('selectstart', (event) => {
            if (this.#xrInputSource === event.inputSource) {
                this.checkForNearbyInteractables();
            }
        });
        session.addEventListener('selectend', (event) => {
            if (this.#xrInputSource === event.inputSource) {
                this.stopInteraction();
            }
        });

        const scene = this.scene as Scene;
        scene.onPreRender.add(this._onPreRender);
    }

    private _endSession() {
        this.#referenceSpace = null;
        this.#xrInputSource = null;
        this.stopInteraction();
        const scene = this.scene as Scene;
        scene.onPreRender.remove(this._onPreRender);
    }
}
