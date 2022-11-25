import { vec3 } from 'gl-matrix';
// @ts-ignore
import { Component } from '@wonderlandengine/api';

/**
 * Hello, I am a grabbable!
 */
export class Grabbable extends Component {
  static TypeName = 'grabbable';
  static Properties = {};

  /**
   * Properties.
   */

  public originA!: vec3;
  public originB: vec3 | null = null;

  /**
   * Private Attributes.
   */

  /** Collision component of this object */
  private _collision!: any;
  private object!: any;

  constructor() {
    super();
    this._collision = null;
  }

  public start(): void {
    this._collision = this.object.getComponent('collision');
    if(!this._collision)
      throw new Error('grabbable.start(): No collision component found');
  }

  public update(): void {

  }

  public enterGrab(): void {
    console.log('GRABBED!');
  }

  public exitGrab(): void {
    console.log('RELEASED!');
  }
}
