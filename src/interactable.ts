import { Component, CollisionComponent, Type } from '@wonderlandengine/api';
import { boolean } from '@wonderlandengine/api/decorators';

import { Interactor } from './interactor.js';
import { Observable } from './utils/observer.js';

export class Interactable extends Component {
  static TypeName = 'interactable';
  static Properties = {
    useIntersectionPoint: { type: Type.Bool, default: false, values: [] }
  };

  /**
   * Properties.
   */

  public useIntersectionPoint: boolean = false;

  /**
   * Private Attributes.
   */

  private _collision: CollisionComponent = null!;

  private readonly _onSelectStart: Observable<Interactor> = new Observable();
  private readonly _onSelectEnd: Observable<Interactor> = new Observable();

  public start(): void {
    this._collision = this.object.getComponent('collision', 0)!;
    if(!this._collision) {
      throw new Error('Interactable.start(): No collision component found on the handle.');
    }
  }

  public get onSelectStart(): Observable<Interactor> {
    return this._onSelectStart;
  }

  public get onSelectEnd(): Observable<Interactor> {
    return this._onSelectEnd;
  }
}
