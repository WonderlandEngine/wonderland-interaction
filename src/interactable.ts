import { Component, CollisionComponent } from '@wonderlandengine/api';
import { property } from '@wonderlandengine/api/decorators.js';

import { Interactor } from './interactor.js';
import { Observable } from './utils/observer.js';

export class Interactable extends Component {
  static TypeName = 'interactable';

  /**
   * Properties.
   */

  @property.bool(true)
  public snap: boolean = true;

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
