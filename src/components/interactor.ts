import {vec3} from 'gl-matrix';

import { CollisionComponent, Component, ComponentConstructor, Object3D, Scene, Type } from '@wonderlandengine/api';
import { property } from '@wonderlandengine/api/decorators.js';

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

  static Dependencies = [Interactable];

  /**
   * Public Attributes.
   */

  @property.enum(HandednessValues, Handedness.Right)
  public handedness!: number;

  @property.object()
  public ray: Object3D | null = null;

  /**
   * Private Attributes.
   */

  /** Collision component of this object */
  private _collision: CollisionComponent = null!;
  private _rayCollision: CollisionComponent | null = null!;

  private _interactable: Interactable | null = null;

  private _currentFrame: number = 0;

  private _xrPoseFlag: number = -1;

  private _onPostRender = () => ++this._currentFrame;
  private _onSceneLoaded = () => {
    const scene = this.engine.scene;
    if(this._previousScene) {
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
    if(!this._collision)
      throw new Error('grabber.start(): No collision component found');

    if (this.engine.xrSession) {
      this._setup(this.engine.xrSession);
    } else {
      this.engine.onXRSessionStart.push(this._setup.bind(this));
    }

    this._onSceneLoaded();
  }

  onActivate(): void {
    this._rayCollision = this.ray?.getComponent(CollisionComponent) ?? null;
  }

  update() {
      if (!this._rayCollision) return;

      // @todo: Add delay to only check every few frames
      const overlaps = this._rayCollision.queryOverlapsFast();
      let closestInteractable = null;
      let closestDistance = Number.MAX_VALUE;

      const position = this.object.getTranslationWorld(vec3.create());

      for (let i = 0; i < overlaps.count; ++i) {
          const interactable = overlaps.data[i].object.getComponent(Interactable);
          if(!interactable) continue;
          const interactableWorld = interactable.object.getTranslationWorld(vec3.create());
          const dist = vec3.squaredDistance(position, interactableWorld);
          if(dist < closestDistance) {
            closestInteractable = interactable;
            closestDistance = dist;
          }
      }

      if(closestInteractable) {
        closestInteractable.onDistanceSelect.notify(this);
      }
  }

  public startInteraction() {
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
        if(item.handedness === handedness) {
          this.#xrInputSource = item;
          break;
        }
      }
    });

    session.addEventListener('end', () => {
      this.#referenceSpace = null;
      this.#xrInputSource = null;
      this.stopInteraction();
    });

    session.addEventListener('selectstart', (event: XRInputSourceEvent) => {
      console.log();
      if(this.#xrInputSource === event.inputSource) {
        this.startInteraction();
      }
    });
    session.addEventListener('selectend', (event: XRInputSourceEvent) => {
      if(this.#xrInputSource === event.inputSource) {
        this.stopInteraction();
      }
    });
  }
}
