import { vec3, mat4, quat } from 'gl-matrix';

import { Component, Object, Type } from '@wonderlandengine/api';

import { Interactor } from './interactor.js';
import { Interactable } from './interactable.js';
import { Observer } from './utils/observer.js';

/**
 * Globals
 */

const vectorA = new Float32Array(3);

export class Grabbable extends Component {
  static TypeName = 'grabbable';
  static Properties = {
    handle: { type: Type.Object, default: null, values: []}
  };

  /**
   * Public Attributes.
   */

  public handle: Object = null!;

  /**
   * Private Attributes.
   */

  private _interactable: Interactable = null!;
  private _startObserver: Observer<Interactor> = new Observer(this._onInteractionStart.bind(this));
  private _stopObserver: Observer<Interactor> = new Observer(this._onInteractionStop.bind(this));

  private _offsetHandle: vec3 = vec3.create();
  private _offsetRot: quat = quat.create();
  private _interactor: Interactor | null = null;

  public start(): void {
    if(!this.handle) {
      throw new Error('Grabbable.start(): `handle` property must be set.');
    }
    this._interactable = this.handle.getComponent(Interactable, 0)!;
    if(!this._interactable) {
      throw new Error('Grabbable.start(): `handle` must have an `Interactable` component.');
    }
  }

  public onActivate(): void {
    this._interactable.onSelectStart.observe(this._startObserver);
    this._interactable.onSelectEnd.observe(this._stopObserver);
  }

  public onDeactivate(): void {
    this._interactable.onSelectStart.unobserve(this._startObserver);
    this._interactable.onSelectEnd.unobserve(this._stopObserver);
  }

  public update(): void {
    if(!this._interactor) return;

    const handRot = this._interactor.object.rotationWorld;

    const rotation = quat.create();
    quat.multiply(rotation, handRot, this._offsetRot);

    this.object.resetRotation();
    this.object.rotationWorld = rotation;

    const world = this._interactor.object.getTranslationWorld(vec3.create());
    this.object.setTranslationWorld(world);
    this.object.translateObject(this._offsetHandle);
  }

  private _onInteractionStart(interactor: Interactor): void {
    const local = this._interactable.object.getTranslationLocal(vec3.create());
    vec3.scale(this._offsetHandle, local, -1);

    const interactorRot = interactor.object.rotationWorld;
    const grabRot = this.object.rotationWorld;

    // Detla = to * inverse(from).
    quat.multiply(this._offsetRot, quat.invert(interactorRot, interactorRot), grabRot);
    quat.normalize(this._offsetRot, this._offsetRot);

    this._interactor = interactor;
  }

  private _onInteractionStop(interactor: Interactor): void {
    this._interactor = null;
  }
}

function logQuat(msg: string, q: quat) {
  console.log(`${msg} = ${q[0]} ${q[1]} ${q[2]} ${q[3]}`);
}
