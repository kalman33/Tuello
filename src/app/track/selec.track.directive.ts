import { AfterViewInit, Directive, Input, OnChanges, SimpleChanges } from "@angular/core";

@Directive({
    selector: '[selectTrack]',
    standalone: true
})
export class SelectTrackDirective implements AfterViewInit, OnChanges {
    private viewInitialized = false;

    @Input('selectTrack') selectedTrack: any;

    ngAfterViewInit(): void {
        this.viewInitialized = true;
        this.scrollToSelected();
    }

    // Le composant n'est plus recréé à chaque clic sur une pastille : il faut
    // aussi défiler quand la sélection change.
    ngOnChanges(changes: SimpleChanges): void {
        if (this.viewInitialized && changes['selectedTrack']) {
            this.scrollToSelected();
        }
    }

    private scrollToSelected(): void {
        if (this.selectedTrack) {
            setTimeout(() => {
                document.getElementById('list-' + this.selectedTrack)?.scrollIntoView({
                    behavior: "smooth",
                    block: "center"
                });
            }, 100);
        }
    }

}
