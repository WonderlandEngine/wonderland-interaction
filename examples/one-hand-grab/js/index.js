/**
 * /!\ This file is auto-generated.
 *
 * This is the entry point of your standalone application.
 *
 * You should register the component you need here, e.g,
 *
 * ```
 * import { MyComponent } from './my-component.js';
 *
 * WL.registerComponent(MyComponent);
 * ```
 */
import { Grabbable, Interactable, Interactor } from 'wle-interaction';
WL.registerComponent(Grabbable, Interactable, Interactor);
import './../../../../../engine/js/editor-components-bundle.js';
import './button.js';
import { DebugComponent } from './debug.js';
WL.registerComponent(DebugComponent);
