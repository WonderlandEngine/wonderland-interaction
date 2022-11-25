import { Grabbable } from './grabbable.js';
// @ts-ignore
import { Component } from '@wonderlandengine/api';

/**
 * Hello, I am a grabber!
 */
export class Grabber extends Component {

  static TypeName = 'grabber';
  static Properties = {};

  /**
   * Private Attributes.
   */

  /** Collision component of this object */
  private _collision: any = null;

  private _grabbed: Grabbable | null = null;

  private object!: any;

  /**
   * Set the collision component needed to perform
   * grab interaction
   *
   * @param collision The collision component
   *
   * @returns This instance, for chaining
   */
  public start() {
    this._collision = this.object.getComponent('collision');
    if(!this._collision)
      throw new Error('grabber.start(): No collision component found');

    // @ts-ignore
    if (WL.xrSession) {
      // @ts-ignore
      this._setup(WL.xrSession);
    } else {
      // @ts-ignore
      WL.onXRSessionStart.push(this._setup.bind(this));
    }
  }

  public update() {}

  public grab() {
    const overlaps = this._collision.queryOverlaps();
    console.log(overlaps);
    for (const overlap of overlaps) {
      const grabbable = overlap.object.getComponent(Grabbable) as Grabbable;
      if (!grabbable) {
        continue;
      }
      this._grabbed = grabbable;
      grabbable.enterGrab();
    }
  }

  public release() {
    this._grabbed?.exitGrab();
  }

  private _setup(session: XRSession) {
    session.addEventListener('selectstart', () => {
        this.grab();
    });
    session.addEventListener('selectend', () => {
        this.grab();
    });
  }
}
