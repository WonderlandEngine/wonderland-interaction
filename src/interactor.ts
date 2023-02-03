import { Component, Type } from '@wonderlandengine/api';
import { Interactable } from './interactable.js';

export enum Handedness {
  Right = 'right',
  Left = 'left',
}
export const HandednessValues = Object.values(Handedness);

/**
 * Hello, I am a grabber!
 */
export class Interactor extends Component {

  static TypeName = 'interactor';
  static Properties = {
    handedness: { type: Type.Enum, default: Handedness.Right, values: HandednessValues }
  };

  /**
   * Public Attributes.
   */

  public handedness!: number;

  /**
   * Private Attributes.
   */

  /** Collision component of this object */
  private _collision: any = null;

  private _interactable: Interactable | null = null;

  /** @hidden */
  #xrInputSource: XRInputSource | null = null;

  /** @hidden */
  #referenceSpace: XRReferenceSpace | XRBoundedReferenceSpace | null = null;

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

  public startInteratction() {
    const overlaps = this._collision.queryOverlaps();
    for (const overlap of overlaps) {
      const interactable = overlap.object.getComponent(Interactable) as Interactable;
      if (interactable) {
        this._interactable = interactable;
        interactable.onSelectStart.notify(this);
      }
    }
  }

  public stopInteraction() {
    this._interactable?.onSelectEnd.notify(this);
  }

  public get referenceSpace(): XRReferenceSpace | XRBoundedReferenceSpace | null {
    return this.#referenceSpace;
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
        this.#xrInputSource = item.handedness === handedness ? item : null;
      }
    });

    session.addEventListener('end', () => {
      this.#referenceSpace = null;
      this.#xrInputSource = null;
      this.stopInteraction();
    });

    session.addEventListener('selectstart', (event: XRInputSourceEvent) => {
      if(this.#xrInputSource === event.inputSource) {
        this.startInteratction();
      }
    });
    session.addEventListener('selectend', (event: XRInputSourceEvent) => {
      if(this.#xrInputSource === event.inputSource) {
        this.stopInteraction();
      }
    });
  }
}
