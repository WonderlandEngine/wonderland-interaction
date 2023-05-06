import {vec3, vec4} from 'gl-matrix';

import {
    CollisionComponent,
    Component,
    Emitter,
    Object3D,
    Scene,
    Type,
} from '@wonderlandengine/api';
import {property} from '@wonderlandengine/api/decorators.js';

import {Interactable} from './interactable.js';
import {Grabbable} from './grabbable.js';

/** Handedness for left / right hands. */
export enum Handedness {
    Right = 'right',
    Left = 'left',
}
export const HandednessValues = Object.values(Handedness);

/**
 * An interactor represents a controller that can:
 *     - Grip {@link Interactable}
 *     - Trigger
 *
 * The interactor is most likely attached to the object onto which the
 * mesh controller is, but this is not mandatory.
 */
export class Interactor extends Component {
    /** @overload */
    static TypeName = 'interactor';

    /** Properties. */

    /** Handedness value. Compare against {@link Handedness}. */
    @property.enum(HandednessValues, Handedness.Right)
    public handedness!: number;

    /** Private Attributes. */

    /** Collision component of this object. @hidden */
    private _collision: CollisionComponent = null!;
    /** Cached interactable after it's gripped. @hidden */
    private _interactable: Interactable | null = null;

    private _currentFrame: number = 0;

    private _xrPoseFlag: number = -1;

    private _onPostRender = () => ++this._currentFrame;
    private _onSceneLoaded = () => {
        const scene = this.engine.scene;
        if (this._previousScene) {
            scene.onPostRender.remove(this._onPostRender);
            this.engine.onSceneLoaded.remove(this._onSceneLoaded);
        }
        this.engine.onSceneLoaded.add(this._onSceneLoaded);
        scene.onPostRender.add(this._onPostRender);
        this._previousScene = this.engine.scene;
    };

    private _previousScene: Scene | null = null;

    /** @hidden */
    #xrInputSource: XRInputSource | null = null;

    /** @hidden */
    #referenceSpace: XRReferenceSpace | XRBoundedReferenceSpace | null = null;

    /** @hidden */
    #xrPose: XRPose | null = null;

    #onGripStart: Emitter = new Emitter();
    #onGripEnd: Emitter = new Emitter();

    private _onSessionStart = this._startSession.bind(this);
    private _onSessionEnd = this._endSession.bind(this);

    /**
     * Set the collision component needed to perform
     * grab interaction
     *
     * @param collision The collision component
     *
     * @returns This instance, for chaining
     */
    start() {
        this._collision = this.object.getComponent('collision', 0)!;
        if (!this._collision)
            throw new Error('grabber.start(): No collision component found');

        this._onSceneLoaded();
    }

    onActivate(): void {
        this.engine.onXRSessionStart.add(this._onSessionStart);
        this.engine.onXRSessionEnd.add(this._onSessionEnd);
    }

    onDeactivate(): void {
        this.engine.onXRSessionStart.add(this._onSessionStart);
        this.engine.onXRSessionEnd.add(this._onSessionEnd);
    }

    /**
     * Force this interactor to start interacting with the given interactable.
     *
     * @param interactable The interactable to process.
     */
    public startInteraction(interactable: Interactable) {
        this._interactable = interactable;
        interactable.onSelectStart.notify(this);
    }

    public checkForNearbyInteractables() {
        const overlaps = this._collision.queryOverlaps();
        for (const overlap of overlaps) {
            const interactable = overlap.object.getComponent(Interactable);
            if (interactable) {
                this.startInteraction(interactable);
                return;
            }
        }
        this.#onGripStart.notify();
    }

    public stopInteraction() {
        if (this._interactable) {
            this._interactable!.onSelectEnd.notify(this);
        }
        this.#onGripEnd.notify();
    }

    get onGripStart(): Emitter {
        return this.#onGripStart;
    }

    get onGripEnd(): Emitter {
        return this.#onGripEnd;
    }

    get xrPose(): XRPose | null {
        if (this._xrPoseFlag === this._currentFrame) return this.#xrPose;

        this._xrPoseFlag = this._currentFrame;

        this.#xrPose = null;
        const frame = this.engine.wasm.webxr_frame;
        if (!frame || !this.#xrInputSource || !this.#referenceSpace) return this.#xrPose;
        if (!this.#xrInputSource.gripSpace) return this.#xrPose;

        const pose = frame.getPose(this.#xrInputSource.gripSpace, this.#referenceSpace);
        this.#xrPose = pose !== undefined ? pose : null;
        return this.#xrPose;
    }

    private _startSession(session: XRSession) {
        this.#referenceSpace = this.engine.xr!.referenceSpaceForType('local');

        session.addEventListener(
            'inputsourceschange',
            (event: XRInputSourceChangeEvent) => {
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
            }
        );

        session.addEventListener('selectstart', (event: XRInputSourceEvent) => {
            if (this.#xrInputSource === event.inputSource) {
                this.checkForNearbyInteractables();
            }
        });
        session.addEventListener('selectend', (event: XRInputSourceEvent) => {
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
