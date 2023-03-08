import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LayoutComponent } from './layout/layout.component';
import { AngularMaterialModule } from '../angular-material.module';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { FlexLayoutModule } from '@angular/flex-layout';
import { JsonViewerComponent } from './json-viewer/json-viewer.component';

@NgModule({
    declarations: [LayoutComponent, JsonViewerComponent],
    imports: [CommonModule, RouterModule, FormsModule, AngularMaterialModule, TranslateModule, FlexLayoutModule],
    exports: [LayoutComponent, AngularMaterialModule, TranslateModule, FlexLayoutModule]
})
export class CoreModule {}
