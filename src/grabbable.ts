import { vec3, quat } from 'gl-matrix';
import { Component, Object, PhysXComponent, WonderlandEngine } from '@wonderlandengine/api';

import { type, Type } from './decorators.js';

import { Interactor } from './interactor.js';
import { Interactable } from './interactable.js';
import { Observer } from './utils/observer.js';
import { HistoryTracker } from './history-tracker.js';

export interface GrabData {
  interactor: Interactor;
  offsetTrans: vec3;
  offsetRot: quat;
}

function setupRotationOffset(data: GrabData, target: Object) {
  const srcRot = data.interactor.object.rotationWorld;
  const targetRot = target.rotationWorld;
  // Detla = to * inverse(from).
  quat.multiply(data.offsetRot, quat.invert(srcRot, srcRot), targetRot);
  quat.normalize(data.offsetRot, data.offsetRot);
}

/**
 * Grabbable object.
 */
export class Grabbable extends Component {
  /** @override */
  static TypeName = 'grabbable';

  /**
   * Public Attributes.
   */

  @type(Type.Object())
  public handle: Object = null!;

  @type(Type.Object())
  public handleSecondary: Object = null!;

  @type(Type.Bool(true))
  /**
   * Whether the object can be thrown with physics or not.
   *
   * When the interactor releases this grabbable, it will be thrown based on
   * the velocity the interactor had.
   */
  public canThrow: boolean = true;

  @type(Type.Float(1.0))
  public throwLinearIntensity: number = 1.0;
  public throwAngularIntensity: number = 1.0;

  /**
   * Private Attributes.
   */

  private _interactable: Interactable[] = new Array(2);
  private _grabData: (GrabData | null)[] = new Array(2);
  private _maxSqDistance: number | null = null;

  private _startObservers: Observer<Interactor>[] = new Array(2);
  private _stopObservers: Observer<Interactor>[] = new Array(2);

  private _history: HistoryTracker = new HistoryTracker();

  private _physx: PhysXComponent | null = null;

  constructor(engine: WonderlandEngine) {
    super(engine);

    for(let i = 0; i < 2; ++i) {
      this._grabData[i] = null;
      ((index: number) => {
        this._startObservers[i] = new Observer((interactor: Interactor) => this._onInteractionStart(interactor, index));
        this._stopObservers[i] = new Observer((interactor: Interactor) => this._onInteractionStop(interactor, index));
      })(i);
    }
  }

  start(): void {
    if(!this.handle) {
      throw new Error('Grabbable.start(): `handle` property must be set.');
    }

    this._interactable[0] = this.handle.getComponent(Interactable)!;
    if(!this._interactable[0]) {
      throw new Error(`Grabbable.start(): 'handle' must have an Interactable component.`);
    }

    /* The second handle is optional. */
    if(this.handleSecondary) {
      this._interactable[1] = this.handleSecondary.getComponent(Interactable)!;
      if(!this._interactable[1]) {
        throw new Error(`Grabbable.start(): 'handleSecondary' must have an Interactable component.`);
      }
    }
    this._physx = this.object.getComponent('physx');
  }

  onActivate(): void {
    for(let i = 0; i < 2; ++i) {
      const interactable = this._interactable[i];
      if(interactable) {
        interactable.onSelectStart.observe(this._startObservers[i]);
        interactable.onSelectEnd.observe(this._stopObservers[i]);
      }
    }
  }

  onDeactivate(): void {
    for(let i = 0; i < 2; ++i) {
      const interactable = this._interactable[i];
      if(interactable) {
        interactable.onSelectStart.unobserve(this._startObservers[i]);
        interactable.onSelectEnd.unobserve(this._stopObservers[i]);
      }
    }
  }

  update(dt: number): void {
    const grabPrimary = this._grabData[0];
    const grabSecondary = this._grabData[1];
    if (grabPrimary === null && grabSecondary === null) return;

    let anyGrab: GrabData | null = null;

    if (grabPrimary !== null && grabSecondary !== null) {
      anyGrab = grabPrimary;
      this._updateTransformDoubleHand(this._grabData as GrabData[], dt);
    } else {
      anyGrab = grabPrimary ?? grabSecondary as GrabData;
      this._updateTransformSingleHand(anyGrab, dt);
    }

    const xrPose = anyGrab.interactor.xrPose;
    if(xrPose) {
      this._history.updateFromPose(xrPose, this.object, dt);
    } else {
      this._history.update(this.object, dt);
    }
  }

  throw(): void {
    if(!this._physx) return;

    const angular = this._history.angular(vec3.create());
    vec3.scale(angular, angular, this.throwAngularIntensity);

    const radius = vec3.create();
    vec3.subtract(radius,
      this.object.getTranslationWorld(vec3.create()),
      // @todo: How to deal with that for 2 hands?
      this._interactable[0].object.getTranslationWorld(vec3.create())
    );

    const velocity = this._history.velocity(vec3.create());
    vec3.add(velocity, velocity, vec3.cross(vec3.create(), angular, radius));
    vec3.scale(velocity, velocity, this.throwLinearIntensity);

    this._physx.active = true;
    this._physx.linearVelocity = velocity;
    this._physx.angularVelocity = angular;
  }

  get isGrabbed() {
    return this.primaryGrab || this.secondaryGrab;
  }

  get primaryGrab(): GrabData | null {
    return this._grabData[0];
  }

  get secondaryGrab(): GrabData | null {
    return this._grabData[1];
  }

  private _onInteractionStart(interactor: Interactor, index: number): void {
    console.log('Start');

    if(this._grabData[index]) return;

    const grab: GrabData = {interactor, offsetTrans: vec3.create(), offsetRot: quat.create()};

    const interactable = this._interactable[index];
    const local = interactable.object.getTranslationLocal(vec3.create());
    vec3.scale(grab.offsetTrans, local, -1);

    setupRotationOffset(grab, this.object);

    this._grabData[index] = grab;
    this._history.reset(this.object);
    if(this._physx) this._physx.active = false;

    if(this.primaryGrab && this.secondaryGrab) {
      this._maxSqDistance = vec3.squaredDistance(
        this._interactable[0].object.getTranslationWorld(vec3.create()),
        this._interactable[1].object.getTranslationWorld(vec3.create()),
      );
    }
  }

  private _onInteractionStop(interactor: Interactor, index: number): void {
    const grab = this._grabData[index];
    if(!grab || interactor !== grab.interactor) return;

    const secondaryGrab = index === 0 ? this._grabData[1] : this._grabData[0];
    if (secondaryGrab) {
      setupRotationOffset(secondaryGrab, this.object);
    }

    this._grabData[index] = null;
    this._maxSqDistance = null;

    if(this.canThrow && !this.isGrabbed) {
      this.throw();
    }
  }

  private _updateTransformSingleHand(grab: GrabData, dt: number) {
    const interactor = grab.interactor;
    const handRot = interactor.object.rotationWorld;

    const rotation = quat.create();
    quat.multiply(rotation, handRot, grab.offsetRot);

    this.object.resetRotation();
    this.object.rotationWorld = rotation;

    const world = interactor.object.getTranslationWorld(vec3.create());
    this.object.setTranslationWorld(world);
    this.object.translateObject(grab.offsetTrans);
  }

  private _updateTransformDoubleHand(grab: GrabData[], dt: number) {
    const primaryInteractor = grab[0].interactor;
    const secondaryInteractor = grab[1].interactor;

    const primaryWorld = primaryInteractor.object.getTranslationWorld(vec3.create());
    const secondaryWorld = secondaryInteractor.object.getTranslationWorld(vec3.create());

    console.log(`${vec3.squaredDistance(primaryWorld, secondaryWorld)} vs ${this._maxSqDistance! * 1.15}`);

    if(vec3.squaredDistance(primaryWorld, secondaryWorld) > this._maxSqDistance! * 2.0) {
      /* Detach second hand when grabbing distance is too big. */
      this._onInteractionStop(secondaryInteractor, 1);
      return;
    }

    this.object.setTranslationWorld(primaryWorld);
    this.object.translateObject(grab[0].offsetTrans);

    const dir = vec3.subtract(vec3.create(), secondaryWorld, primaryWorld);
    vec3.normalize(dir, dir);
    vec3.scale(dir, dir, 100.0);

    this.object.lookAt(vec3.add(vec3.create(), primaryWorld, dir));
  }
}
