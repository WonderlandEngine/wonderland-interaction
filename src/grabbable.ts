import { vec3, mat4, quat } from 'gl-matrix';

import { Component, Object, PhysXComponent, Type } from '@wonderlandengine/api';

import { Interactor } from './interactor.js';
import { Interactable } from './interactable.js';
import { Observer } from './utils/observer.js';
import { HistoryTracker } from './history-tracker.js';

export class Grabbable extends Component {
  /** @override */
  static TypeName = 'grabbable';
  /** @override */
  static Properties = {
    handle: { type: Type.Object, default: null, values: []},

    /**
     * Whether the object can be thrown with physics or not. For more information,
     * lease have a look at {@link Grabbable.canThrow}.
     */
    canThrow: { type: Type.Bool, default: true, values: []},

    throwLinearIntensity: { type: Type.Float, default: 1.0 },
  };

  /**
   * Public Attributes.
   */

  public handle: Object = null!;

  /**
   * Whether the object can be thrown with physics or not.
   *
   * When the interactor releases this grabbable, it will be thrown based on
   * the velocity the interactor had.
   */
  public canThrow: boolean = true;

  public throwLinearIntensity: number = 0.5;

  /**
   * Private Attributes.
   */

  private _interactable: Interactable = null!;
  private _physx: PhysXComponent | null = null;

  private _startObserver: Observer<Interactor> = new Observer(this._onInteractionStart.bind(this));
  private _stopObserver: Observer<Interactor> = new Observer(this._onInteractionStop.bind(this));

  private _offsetHandle: vec3 = vec3.create();
  private _offsetRot: quat = quat.create();
  private _interactor: Interactor | null = null;

  private _history: HistoryTracker = new HistoryTracker();

  public start(): void {
    if(!this.handle) {
      throw new Error('Grabbable.start(): `handle` property must be set.');
    }
    this._interactable = this.handle.getComponent(Interactable, 0)!;
    if(!this._interactable) {
      throw new Error('Grabbable.start(): `handle` must have an `Interactable` component.');
    }
    this._physx = this.object.getComponent('physx');
  }

  public onActivate(): void {
    this._interactable.onSelectStart.observe(this._startObserver);
    this._interactable.onSelectEnd.observe(this._stopObserver);
  }

  public onDeactivate(): void {
    this._interactable.onSelectStart.unobserve(this._startObserver);
    this._interactable.onSelectEnd.unobserve(this._stopObserver);
  }

  public update(dt: number): void {
    if(!this._interactor) return;

    const handRot = this._interactor.object.rotationWorld;

    const rotation = quat.create();
    quat.multiply(rotation, handRot, this._offsetRot);

    this.object.resetRotation();
    this.object.rotationWorld = rotation;

    const world = this._interactor.object.getTranslationWorld(vec3.create());
    this.object.setTranslationWorld(world);
    this.object.translateObject(this._offsetHandle);

    const xrPose = this._interactor.xrPose;
    if(xrPose) {
      this._history.updateFromPose(xrPose, this.object, dt);
    } else {
      this._history.update(this.object, dt);
    }

    const velocity = this._history.velocity(vec3.create());
    vec3.scale(velocity, velocity, this.throwLinearIntensity);
  }

  public throw(): void {
    if(!this._physx) return;
    const velocity = this._history.velocity(vec3.create());
    const angular = this._history.angular(vec3.create());
    vec3.scale(velocity, velocity, this.throwLinearIntensity);
    this._physx.active = true;
    this._physx.linearVelocity = velocity;
    this._physx.angularVelocity = angular;
  }

  private _onInteractionStart(interactor: Interactor): void {
    if(this._interactor) return;

    const local = this._interactable.object.getTranslationLocal(vec3.create());
    vec3.scale(this._offsetHandle, local, -1);

    const interactorRot = interactor.object.rotationWorld;
    const grabRot = this.object.rotationWorld;

    // Detla = to * inverse(from).
    quat.multiply(this._offsetRot, quat.invert(interactorRot, interactorRot), grabRot);
    quat.normalize(this._offsetRot, this._offsetRot);

    this._interactor = interactor;
    this._history.reset(this.object);
    if(this._physx) this._physx.active = false;
  }

  private _onInteractionStop(interactor: Interactor): void {
    if(interactor != this._interactor) return;
    if(this.canThrow) {
      this.throw();
    }
    this._interactor = null;
  }
}
