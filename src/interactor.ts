import { Component, Scene, Type } from '@wonderlandengine/api';
import { Interactable } from './interactable.js';

export enum Handedness {
  Right = 'right',
  Left = 'left',
}
export const HandednessValues = Object.values(Handedness);

/**
 * Hello, I am a grabber!
 */
export class Interactor extends Component {

  static TypeName = 'interactor';
  static Properties = {
    handedness: { type: Type.Enum, default: Handedness.Right, values: HandednessValues }
  };

  /**
   * Public Attributes.
   */

  public handedness!: number;

  /**
   * Private Attributes.
   */

  /** Collision component of this object */
  private _collision: any = null;

  private _interactable: Interactable | null = null;

  private _currentFrame: number = 0;

  private _xrPoseFlag: number = -1;

  private _onPostRender = () => ++this._currentFrame;
  private _onSceneLoaded = () => {
    const scene = this.engine.scene;
    if(this._previousScene) {
      let index = scene.onPostRender.indexOf(this._onPostRender);
      if(index >= 0) scene.onPostRender.splice(index, 1);
      index = this.engine.onSceneLoaded.indexOf(this._onSceneLoaded);
      if(index >= 0) this.engine.onSceneLoaded.splice(index, 1);
    }
    this.engine.onSceneLoaded.push(this._onSceneLoaded);
    scene.onPostRender.push(this._onPostRender);
    this._previousScene = this.engine.scene;
  };

  private _previousScene: Scene | null = null;

  /** @hidden */
  #xrInputSource: XRInputSource | null = null;

  /** @hidden */
  #referenceSpace: XRReferenceSpace | XRBoundedReferenceSpace | null = null;

  /** @hidden */
  #xrPose: XRPose | null = null;

  /**
   * Set the collision component needed to perform
   * grab interaction
   *
   * @param collision The collision component
   *
   * @returns This instance, for chaining
   */
  public start() {
    this._collision = this.object.getComponent('collision', 0);
    if(!this._collision)
      throw new Error('grabber.start(): No collision component found');

    if (this.engine.xrSession) {
      this._setup(this.engine.xrSession);
    } else {
      this.engine.onXRSessionStart.push(this._setup.bind(this));
    }

    this._onSceneLoaded();
  }

  public startInteratction() {
    const overlaps = this._collision.queryOverlaps();
    for (const overlap of overlaps) {
      const interactable = overlap.object.getComponent(Interactable);
      if (interactable) {
        this._interactable = interactable;
        interactable.onSelectStart.notify(this);
      }
    }
  }

  public stopInteraction() {
    this._interactable?.onSelectEnd.notify(this);
  }

  public get xrPose(): XRPose | null {
    if(this._xrPoseFlag === this._currentFrame) return this.#xrPose;

    this._xrPoseFlag = this._currentFrame;

    this.#xrPose = null;
    const frame = this.engine.wasm.webxr_frame;
    if(!frame || !this.#xrInputSource || !this.#referenceSpace) return this.#xrPose;
    if(!this.#xrInputSource.gripSpace) return this.#xrPose;

    const pose = frame.getPose(this.#xrInputSource.gripSpace, this.#referenceSpace);
    this.#xrPose = pose !== undefined ? pose : null;
    return this.#xrPose;
  }

  private _setup(session: XRSession) {
    session.requestReferenceSpace('local')
      .then((space) => this.#referenceSpace = space)
      .catch();

    session.addEventListener('inputsourceschange', (event: XRInputSourceChangeEvent) => {
      for(const item of event.removed) {
        if(item === this.#xrInputSource) {
          this.#xrInputSource = null;
          break;
        }
      }
      const handedness = HandednessValues[this.handedness];
      for(const item of event.added) {
        this.#xrInputSource = item.handedness === handedness ? item : null;
      }
    });

    session.addEventListener('end', () => {
      this.#referenceSpace = null;
      this.#xrInputSource = null;
      this.stopInteraction();
    });

    session.addEventListener('selectstart', (event: XRInputSourceEvent) => {
      if(this.#xrInputSource === event.inputSource) {
        this.startInteratction();
      }
    });
    session.addEventListener('selectend', (event: XRInputSourceEvent) => {
      if(this.#xrInputSource === event.inputSource) {
        this.stopInteraction();
      }
    });
  }
}
