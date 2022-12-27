import { Object } from '@wonderlandengine/api';
import { vec3 } from 'gl-matrix';

/**
 * Gloals
 */

const vectorA = vec3.create();

export class HistoryTracker {

  /**
   * @hidden
   */
  private readonly _stack: vec3[] = new Array(8);

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

  public constructor() {
    for(let i = 0; i < this._stack.length; ++i) {
      this._stack[i] = vec3.create();
    }
  }

  public update(target: Object, delta: number): void {
    this._curr = (this._curr + 1) % this._stack.length;

    const position = target.getTranslationWorld(vectorA);
    const out = this._stack[this._curr];
    vec3.subtract(out, position, this._previousPosition);
    vec3.scale(out, out, 1.0 / delta);

    vec3.copy(this._previousPosition, position);
  }

  public reset(target: Object): void {
    this._curr = -1;
    const position = target.getTranslationWorld(vectorA);
    vec3.copy(this._previousPosition, position);
  }

  public velocity(out: vec3 = vec3.create()): vec3 {
    vec3.zero(out);
    const count = this._stack.length;
    for(let i = 0; i < count; ++i) {
      vec3.add(out, out, this._stack[i]);
    }
    vec3.scale(out, out, 1.0 / count);
    return out;
  }

}
