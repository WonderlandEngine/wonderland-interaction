import { Component } from '@wonderlandengine/api';
import { Interactable } from './interactable.js';

/**
 * Hello, I am a grabber!
 */
export class Interactor extends Component {

  static TypeName = 'interactor';
  static Properties = {};

  /**
   * Private Attributes.
   */

  /** Collision component of this object */
  private _collision: any = null;

  private _interactable: Interactable | null = null;

  /**
   * Set the collision component needed to perform
   * grab interaction
   *
   * @param collision The collision component
   *
   * @returns This instance, for chaining
   */
  public start() {
    this._collision = this.object.getComponent('collision', 0);
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

  public update() {
  }

  public grab() {
    const overlaps = this._collision.queryOverlaps();
    for (const overlap of overlaps) {
      const interactable = overlap.object.getComponent(Interactable) as Interactable;
      if (interactable) {
        this._interactable = interactable;
        interactable.onSelectStart.notify(this);
      }
    }
  }

  public release() {
    this._interactable?.onSelectEnd.notify(this);
  }

  private _setup(session: XRSession) {
    session.addEventListener('selectstart', () => {
        this.grab();
    });
    session.addEventListener('selectend', () => {
        this.release();
    });
  }
}
