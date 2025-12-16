import {vec3} from 'gl-matrix';
import {
    CollisionComponent,
    CollisionEventType,
    Component,
    InputComponent,
    MeshComponent,
    Object3D,
    PhysXComponent,
    WonderlandEngine,
} from '@wonderlandengine/api';
import {property} from '@wonderlandengine/api/decorators.js';

import {Grabbable} from './grabbable.js';
import {
    GrabSearchMode,
    GrabPoint,
    InteractorVisualState,
    InteractorVisualStateNames,
} from './grab-point.js';
import {componentError, setComponentsActive} from '../utils/wle.js';
import {DefaultInteractorInput, InteractorInput} from './interactor-input.js';

/**
 * Manages interaction capabilities of a VR controller or a similar input device.
 *
 * The `Interactor` class enables an entity to grip or interact with objects that
 * implement the {@link Interactable} interface.
 */
export class Interactor extends Component {
    static TypeName = 'interactor';

    static onRegister(engine: WonderlandEngine) {
        engine.registerComponent(DefaultInteractorInput);
    }

    /** Properties */

    @property.object()
    public inputObject!: Object3D;

    @property.object()
    meshRoot: Object3D | null = null;

    @property.enum(InteractorVisualStateNames, InteractorVisualState.Visible)
    visualStateOnGrab = InteractorVisualState.Visible;

    @property.object({required: true})
    trackedSpace: Object3D = null!;

    /** Private Attributes. */

    private _input!: InteractorInput;

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

    private _onGrabStart = () => {
        this.checkForNearbyInteractables();
    };

    private _onGrabEnd = () => {
        this.stopInteraction();
    };

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

        let maybeInput = (this.inputObject ?? this.object).getComponent(
            DefaultInteractorInput
        );

        if (!maybeInput) {
            const search = (object: Object3D): InputComponent | null => {
                const input = object.getComponent(InputComponent);
                if (input) return input;
                return object.parent ? search(object.parent) : null;
            };
            const input = search(this.object);
            if (!input) {
                throw new Error(
                    componentError(
                        this,
                        "'InteractoInput' component not provided, and no native input component could found"
                    )
                );
            }
            maybeInput = this.object.addComponent(DefaultInteractorInput, {
                inputObject: input.object,
            });
        }

        this._input = maybeInput;
    }

    onActivate(): void {
        if (!this._collision) {
            this._physxCallback = this._physx.onCollision(this.onPhysxCollision);
        }

        this._input.onGrabStart.add(this._onGrabStart);
        this._input.onGrabEnd.add(this._onGrabEnd);
    }

    onDeactivate(): void {
        if (this._physxCallback !== null) {
            this._physx.removeCollisionCallback(this._physxCallback);
            this._physxCallback = null;
        }

        if (!this._input.isDestroyed) {
            this._input.onGrabStart.remove(this._onGrabStart);
            this._input.onGrabEnd.remove(this._onGrabEnd);
        }
    }

    /**
     * Force this interactor to start interacting with the given interactable.
     *
     * @param interactable The interactable to process.
     */
    public startInteraction(interactable: Grabbable, handleId: number) {
        const handle = interactable.grabPoints[handleId];
        if (handle.interactor) {
            if (!handle.transferable) return;
            interactable.release(handle.interactor);
        }
        handle._interactor = this;

        this._grabbable = interactable;
        interactable.grab(this, handleId);

        let hidden = this.visualStateOnGrab === InteractorVisualState.Hidden;
        if (interactable.interactorVisualState !== InteractorVisualState.None) {
            hidden = interactable.interactorVisualState === InteractorVisualState.Hidden;
        }
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
            for (let h = 0; h < grabbable.grabPoints.length; ++h) {
                const handle = grabbable.grabPoints[h];
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
        }
        this._grabbable = null;

        if (this.meshRoot && !this.meshRoot.isDestroyed) {
            setComponentsActive(this.meshRoot, true, MeshComponent);
        }
    }

    /**
     * Current interactable handled by this interactor. If no interaction is ongoing,
     * this getter returns `null`.
     */
    get interactable(): Grabbable | null {
        return this._grabbable;
    }

    /** {@link InteractorInput} */
    get input(): InteractorInput {
        return this._input;
    }
}
