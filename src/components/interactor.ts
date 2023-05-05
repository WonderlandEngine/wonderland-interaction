import {vec3, vec4} from 'gl-matrix';

import { CollisionComponent, Component, Object3D, Scene, Type } from '@wonderlandengine/api';
import { property } from '@wonderlandengine/api/decorators.js';

import { Interactable } from './interactable.js';
import { Grabbable } from './grabbable.js';
import { radiusHierarchy } from '../utils/wle.js';

export enum Handedness {
  Right = 'right',
  Left = 'left',
}
export const HandednessValues = Object.values(Handedness);

enum InteractionType {
  None = 0,
  InteractNearby,
  InteractDistance,
  Searching,
}

function search(target: Object3D, collision: CollisionComponent | null): Grabbable | null {
  if(!collision) return null;
  // @todo: Add delay to only check every few frames
  const overlaps = collision.queryOverlaps();
  let closestDistance = Number.MAX_VALUE;
  let closestGrabbable: Grabbable | null = null;

  const position = target.getPositionWorld(vec3.create());
  for (let i = 0; i < overlaps.length; ++i) {
      const grabbable = overlaps[i].object.getComponent(Grabbable);
      if(!grabbable) continue;
      const interactableWorld = grabbable.object.getPositionWorld(vec3.create());
      const dist = vec3.squaredDistance(position, interactableWorld);
      if(dist < closestDistance) {
        closestGrabbable = grabbable;
        closestDistance = dist;
      }
  }
  return closestGrabbable;
}

function distanceFetch(target: Object3D, from: Object3D, to: Object3D, speed: number): boolean {
  const grabToInteractor = vec3.create();
  vec3.subtract(grabToInteractor, to.getPositionWorld(), from.getPositionWorld());

  vec3.normalize(grabToInteractor, grabToInteractor);
  vec3.scale(grabToInteractor, grabToInteractor, speed * 10.0); // `10` for base speed.
  target.translateWorld(grabToInteractor);

  vec3.subtract(grabToInteractor, from.getPositionWorld(), to.getPositionWorld());
  return vec3.squaredLength(grabToInteractor) < 0.01;
}

function resetMarker(target: Object3D | null | undefined) {
  target?.setPositionWorld([-100, -100, -100]);
}

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
  private _grabbable: Grabbable | null = null;

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

  private _interaction: InteractionType = InteractionType.None;

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
    this._interaction = InteractionType.Searching;
  }

  onDeactivate(): void {
    this._interaction = InteractionType.None;
  }

  update(dt: number) {
      switch(this._interaction) {
        case InteractionType.Searching:
          const grabbable = search(this.object, this._rayCollision);
          if(grabbable?.distanceMarker) {
            const scale = radiusHierarchy(vec4.create(), grabbable.object);
            grabbable.distanceMarker.setPositionWorld(grabbable.object.getPositionWorld());
            grabbable.distanceMarker.setScalingWorld([scale, scale, scale]);
          } else if(this._grabbable && !grabbable) {
            resetMarker(this._grabbable.distanceMarker);
          }
          this._grabbable = grabbable;
          break;
        case InteractionType.InteractDistance:
          if(distanceFetch(this._grabbable!.object, this._interactable!.object, this.object, this._grabbable!.distanceSpeed * dt)) {
            this._interaction = InteractionType.InteractNearby;
            this._grabbable = null;
            this._startInteractNearby(this._interactable!);
          }
          break;
      }
  }

  public startInteraction() {
    const overlaps = this._collision.queryOverlaps();
    for (const overlap of overlaps) {
      const interactable = overlap.object.getComponent(Interactable);
      if (interactable) {
        this._startInteractNearby(interactable);
        return;
      }
    }

    if(this._interaction === InteractionType.Searching && this._grabbable) {
      this._interactable = this._grabbable.getInteractable(this._grabbable.distanceHandle);
      this._interaction = InteractionType.InteractDistance;
      resetMarker(this._grabbable.distanceMarker);
      this._grabbable.disablePhysx();
    }
  }

  public stopInteraction() {
    switch(this._interaction) {
      case InteractionType.InteractNearby:
        this._interactable!.onSelectEnd.notify(this);
        break;
      case InteractionType.InteractDistance:
        this._grabbable!.enablePhysx();
        this._grabbable!.distanceMarker?.setPositionWorld([-100, -100, -100]);
        break;
    }
    this._interaction = InteractionType.Searching;
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

  private _startInteractNearby(interactable: Interactable) {
    this._interactable = interactable;
    this._interaction = InteractionType.InteractNearby;
    interactable.onSelectStart.notify(this);
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
