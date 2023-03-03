import { Object } from '@wonderlandengine/api';
import { vec3, ReadonlyVec3 } from 'gl-matrix';

/** Constants. */

const StackSize = 4;

/** Globals. */

const vectorA = vec3.create();

export class HistoryTracker {

  /**
   * @hidden
   */
  private readonly _stack: vec3[] = new Array(StackSize);
  private readonly _angular: vec3[] = new Array(StackSize);

  /**
   * Current position.
   *
   * @hidden
   */
  private _curr: number = -1;

  /**
   * @hidden
   */
  private _previousPosition: vec3 = vec3.create();

  constructor() {
    for(let i = 0; i < this._stack.length; ++i) {
      this._stack[i] = vec3.create();
      this._angular[i] = vec3.create();
    }
  }

  update(target: Object, delta: number): void {
    this._curr = (this._curr + 1) % this._stack.length;

    const linearOutput = this._stack[this._curr];
    const angularOutput = this._angular[this._curr];
    this._updateLinear(linearOutput, target, delta);
    this._updateAngular(angularOutput, target, delta);

    console.log(linearOutput);
  }

  updateFromPose(xrPose: XRPose, target: Object, delta: number): void {
    // @ts-ignore Unfortunately, typings are outdated.
    const velocity: DOMPointReadOnly | null = xrPose.linearVelocity;
    // @ts-ignore Unfortunately, typings are outdated.
    const angular: DOMPointReadOnly | null = xrPose.angularVelocity;
    this._curr = (this._curr + 1) % this._stack.length;

    const linearOutput = this._stack[this._curr];
    if(velocity) {
      linearOutput[0] = velocity.x;
      linearOutput[1] = velocity.y;
      linearOutput[2] = velocity.z;
    } else {
      this._updateLinear(linearOutput, target, delta);
    }

    const angularOutput = this._stack[this._curr];
    if(angular) {
      angularOutput[0] = angular.x;
      angularOutput[1] = angular.y;
      angularOutput[2] = angular.z;
    } else {
      this._updateAngular(angularOutput, target, delta);
    }

    console.log(linearOutput);
  }

  reset(target: Object): void {
    this._curr = -1;
    const position = target.getTranslationWorld(vectorA);
    vec3.copy(this._previousPosition, position);
  }

  velocity(out: vec3 = vec3.create()): vec3 {
    vec3.zero(out);
    const count = this._stack.length;
    for(let i = 0; i < count; ++i) {
      vec3.add(out, out, this._stack[i]);
    }
    vec3.scale(out, out, 1.0 / count);
    return out;
  }

  private _updateLinear(out: vec3, target: Object, delta: number): void {
    const position = target.getTranslationWorld(vectorA);
    vec3.subtract(out, position, this._previousPosition);
    vec3.scale(out, out, 1.0 / delta);
    vec3.copy(this._previousPosition, position);
  }

  private _updateAngular(out: vec3, target: Object, delta: number): void {
    /* @todo: Handle angular velocity. */
  }

}
