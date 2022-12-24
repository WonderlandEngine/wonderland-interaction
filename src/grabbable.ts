import { vec3 } from 'gl-matrix';

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

  private _offsetHandle: Float32Array = new Float32Array(3);
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
    this._interactor.object.getTranslationWorld(vectorA);

    const rotation = this._interactor.object.rotationWorld;
    this.object.setTranslationWorld(vectorA);
    this.object.translateWorld(this._offsetHandle);
    this.object.rotationWorld = rotation;
  }

  private _onInteractionStart(interactor: Interactor): void {
    this._interactor = interactor;
    const a = this.object.getTranslationWorld(vectorA);
    const b = this._interactable.object.getTranslationWorld(this._offsetHandle);
    vec3.subtract(this._offsetHandle, a, b);
  }

  private _onInteractionStop(interactor: Interactor): void {
    this._interactor = null;
  }
}
