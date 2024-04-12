import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LayoutComponent } from './layout/layout.component';
import { AngularMaterialModule } from '../angular-material.module';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { FlexLayoutModule } from '@angular/flex-layout';
import { JsonViewerComponent } from './json-viewer/json-viewer.component';
import { NgxJsonViewerModule } from 'ngx-json-viewer';
import { MatIconModule, MatIconRegistry } from '@angular/material/icon';
import { RateSupportComponent } from './layout/rate-support/rate-support.component';
import { MatButtonModule } from '@angular/material/button';
import {
    MatBottomSheetModule,
} from '@angular/material/bottom-sheet';
import { MatDialogModule } from '@angular/material/dialog';

@NgModule({
    declarations: [LayoutComponent, RateSupportComponent, JsonViewerComponent],
    imports: [CommonModule, RouterModule, FormsModule, AngularMaterialModule, TranslateModule, FlexLayoutModule, NgxJsonViewerModule, MatIconModule, MatButtonModule, MatBottomSheetModule],
    exports: [LayoutComponent, RateSupportComponent, AngularMaterialModule, TranslateModule, FlexLayoutModule, NgxJsonViewerModule, MatIconModule],
    providers: [MatIconRegistry]
})
export class CoreModule { }
