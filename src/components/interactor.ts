import {
    CollisionComponent,
    CollisionEventType,
    Component,
    Emitter,
    PhysXComponent,
    Scene,
} from '@wonderlandengine/api';
import {property} from '@wonderlandengine/api/decorators.js';
import {Interactable} from './interactable.js';

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
    private _interactable: Interactable | null = null;

    /** Previous loaded scene. */
    private _previousScene: Scene | null = null;

    /** Grip start emitter. */
    private readonly _onGripStart: Emitter<[Interactable]> = new Emitter();
    /** Grip end emitter. */
    private readonly _onGripEnd: Emitter<[Interactable]> = new Emitter();

    private readonly _onPreRender = () => {
        if (
            this.engine.xr &&
            this.#xrInputSource &&
            this.#xrInputSource.gripSpace &&
            this.#referenceSpace
        ) {
            const pose = this.engine.xr.frame.getPose(
                this.#xrInputSource.gripSpace,
                this.#referenceSpace
            );
            this.#xrPose = pose ?? null;
        }
    };

    private readonly _onSceneLoaded = () => {
        const scene = this.engine.scene;
        if (this._previousScene) {
            scene.onPreRender.remove(this._onPreRender);
            this.engine.onSceneLoaded.remove(this._onSceneLoaded);
        }
        this.engine.onSceneLoaded.add(this._onSceneLoaded);
        scene.onPreRender.add(this._onPreRender);
        this._previousScene = this.engine.scene;
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

        this._onSceneLoaded();
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
    public startInteraction(interactable: Interactable) {
        this._interactable = interactable;
        interactable.onSelectStart.notify(this, interactable);
        this._onGripStart.notify(interactable);
    }

    /**
     * Check for nearby interactable, and notifies one if this interactor
     * interacts with it.
     */
    public checkForNearbyInteractables() {
        if (this._collision) {
            const overlaps = this._collision.queryOverlaps();
            for (const overlap of overlaps) {
                const interactable = overlap.object.getComponent(Interactable);
                if (interactable) {
                    this.startInteraction(interactable);
                    return;
                }
            }
        } else {
            if (this.#currentlyCollidingWith) {
                const interactable =
                    this.#currentlyCollidingWith.object.getComponent(Interactable);
                if (interactable) {
                    this.startInteraction(interactable);
                    return;
                }
            }
        }
    }

    onPhysxCollision = (type: CollisionEventType, other: PhysXComponent) => {
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
            this._interactable.onSelectEnd.notify(this, this._interactable);
            this._onGripEnd.notify(this._interactable);
        }
        this._interactable = null;
    }

    /** Notified on a grip start. */
    get onGripStart(): Emitter<[Interactable]> {
        return this._onGripStart;
    }

    /** Notified on a grip end. */
    get onGripEnd(): Emitter<[Interactable]> {
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
    get interactable(): Interactable | null {
        return this._interactable;
    }

    private _startSession(session: XRSession) {
        this.#referenceSpace = this.engine.xr!.referenceSpaceForType('local');

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
    }

    private _endSession() {
        this.#referenceSpace = null;
        this.#xrInputSource = null;
        this.stopInteraction();
    }
}
