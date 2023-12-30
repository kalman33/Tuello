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

@NgModule({
    declarations: [LayoutComponent, JsonViewerComponent],
    imports: [CommonModule, RouterModule, FormsModule, AngularMaterialModule, TranslateModule, FlexLayoutModule, NgxJsonViewerModule],
    exports: [LayoutComponent, AngularMaterialModule, TranslateModule, FlexLayoutModule, NgxJsonViewerModule]
})
export class CoreModule {}
