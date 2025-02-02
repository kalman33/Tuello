import { ChangeDetectionStrategy, Component, ViewEncapsulation } from '@angular/core';
import { RecorderHttpComponent } from './recorder-http.component';
import {MatProgressSpinnerModule} from '@angular/material/progress-spinner';
import { CommonModule } from '@angular/common';

@Component({
    selector: 'mmn-recorder-http-page',
    templateUrl: './recorder-http-page.component.html',
    styleUrls: ['./recorder-http-page.component.scss'],
    encapsulation: ViewEncapsulation.None,
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [CommonModule, RecorderHttpComponent, MatProgressSpinnerModule]
})
export class RecorderHttpPageComponent {
 

}
