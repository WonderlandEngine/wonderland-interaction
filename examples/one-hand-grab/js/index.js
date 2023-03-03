import '@wonderlandengine/components';
import { Grabbable, Interactable, Interactor } from 'wle-interaction';
WL.registerComponent(Grabbable, Interactable, Interactor);
import './button.js';
import { DebugComponent } from './debug.js';
WL.registerComponent(DebugComponent);
