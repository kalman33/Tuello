import { NgClass } from '@angular/common';
import { AfterViewInit, ChangeDetectionStrategy, Component, inject, OnDestroy } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltip } from '@angular/material/tooltip';
import { ExtendedModule } from '@ngbracket/ngx-layout/extended';
import { FlexModule } from '@ngbracket/ngx-layout/flex';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { createJSONEditor, JsonEditor, TextContent } from 'vanilla-jsoneditor';
import { ROUTE_ANIMATIONS_ELEMENTS } from '../core/animations/route.animations';

// Traductions anglais -> français pour vanilla-jsoneditor
const TRANSLATIONS_FR: Record<string, string> = {
    // Status bar
    'Line': 'Ligne',
    'Column': 'Colonne',
    'Col': 'Col',
    'column': 'colonne',
    'line': 'ligne',
    'selected': 'sélectionné(s)',
    'characters': 'caractères',
    'lines': 'lignes',
    // Erreurs de parsing JSON
    'Parse error': 'Erreur de syntaxe',
    'Unexpected token': 'Symbole inattendu',
    'Expected': 'Attendu',
    'Unexpected end of JSON input': 'Fin inattendue du JSON',
    'Invalid character': 'Caractère invalide',
    'position': 'position',
    'at line': 'à la ligne',
    'at column': 'à la colonne',
    'JSON parse error': 'Erreur de parsing JSON',
    'Cannot repair': 'Impossible de réparer',
    'Unexpected': 'Inattendu',
    'in JSON at line': 'dans le JSON à la ligne',
    'in JSON': 'dans le JSON',
    'after property value': 'après la valeur de propriété',
    'after property name': 'après le nom de propriété',
    'after array element': 'après l\'élément du tableau',
    'Bad control character in string literal': 'Caractère de contrôle invalide dans la chaîne',
    ' or ': ' ou ',
    // Messages de validation
    'validation error': 'erreur de validation',
    'validation errors': 'erreurs de validation',
    // Boutons et actions
    'Repair': 'Réparer',
    'Auto repair': 'Réparer auto',
    'Show me': 'Afficher',
    'Apply': 'Appliquer',
    'Cancel': 'Annuler',
    'Format': 'Formater',
    'No thanks': 'Non merci',
    'Do you want to format the JSON?': 'Voulez-vous formater le JSON ?',
    'Automatically repair JSON': 'Réparer automatiquement le JSON',
    'Move to the parse error location': 'Aller à l\'erreur',
    'Format JSON: add proper indentation and new lines': 'Formater le JSON : ajouter l\'indentation et les retours à la ligne',
    'Close this message': 'Fermer ce message'
};

@Component({
    selector: 'mmn-json-formatter',
    templateUrl: './json-formatter.component.html',
    styleUrls: ['./json-formatter.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [FlexModule, NgClass, ExtendedModule, MatButton, MatIcon, MatTooltip, TranslatePipe]
})
export class JsonFormatterComponent implements AfterViewInit, OnDestroy {
    private snackBar = inject(MatSnackBar);
    private translate = inject(TranslateService);

    routeAnimationsElements = ROUTE_ANIMATIONS_ELEMENTS;

    private jsonEditor: JsonEditor | null = null;
    private translationObserver: MutationObserver | null = null;

    /** Indique si le thème sombre est actif */
    isBlackTheme = false;

    ngAfterViewInit(): void {
        // Détection du thème sombre
        this.isBlackTheme = document.body.classList.contains('black-theme');

        this.initJsonEditor();
        this.initTranslationObserver();
    }

    ngOnDestroy(): void {
        this.jsonEditor?.destroy();
        this.translationObserver?.disconnect();
    }

    /**
     * Initialise l'éditeur JSON avec vanilla-jsoneditor
     */
    private initJsonEditor(): void {
        const container = document.getElementById('jsonEditorContainer');
        if (!container) return;

        this.jsonEditor = createJSONEditor({
            target: container,
            props: {
                content: { text: '' },
                mode: 'text',
                mainMenuBar: false,
                navigationBar: false,
                statusBar: true,
                indentation: 2
            }
        });
    }

    private translationTimeout: ReturnType<typeof setTimeout> | null = null;

    /**
     * Initialise l'observateur pour traduire les textes de l'éditeur
     */
    private initTranslationObserver(): void {
        const container = document.getElementById('jsonEditorContainer');
        if (!container) return;

        // Observer les changements dans le DOM pour traduire les textes
        this.translationObserver = new MutationObserver(() => {
            if (this.translate.currentLang === 'fr') {
                this.debouncedTranslate(container);
            }
        });

        this.translationObserver.observe(container, {
            childList: true,
            subtree: true
        });

        // Traduction initiale
        if (this.translate.currentLang === 'fr') {
            setTimeout(() => this.translateEditorTexts(container), 200);
        }

        // Observer les changements de langue
        this.translate.onLangChange.subscribe(() => {
            if (this.translate.currentLang === 'fr') {
                this.translateEditorTexts(container);
            }
        });
    }

    /**
     * Debounce la traduction pour éviter les boucles infinies
     */
    private debouncedTranslate(container: HTMLElement): void {
        if (this.translationTimeout) {
            clearTimeout(this.translationTimeout);
        }
        this.translationTimeout = setTimeout(() => {
            this.translateEditorTexts(container);
        }, 50);
    }

    /**
     * Traduit les textes de l'éditeur en français
     */
    private translateEditorTexts(container: HTMLElement): void {
        // Désactiver temporairement l'observer
        this.translationObserver?.disconnect();

        // Trier par longueur décroissante pour éviter les remplacements partiels
        const sortedEntries = Object.entries(TRANSLATIONS_FR).sort((a, b) => b[0].length - a[0].length);

        const translateString = (text: string): string => {
            let result = text;
            for (const [en, fr] of sortedEntries) {
                if (result.includes(en)) {
                    result = result.replace(new RegExp(en.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), fr);
                }
            }
            return result;
        };

        const translateText = (element: Element) => {
            const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null);
            let node: Text | null;
            while ((node = walker.nextNode() as Text)) {
                const text = node.textContent || '';
                const translated = translateString(text);
                if (translated !== text) {
                    node.textContent = translated;
                }
            }
        };

        // Traduire la barre de statut, les messages et les boutons
        const statusBar = container.querySelector('.jse-status-bar');
        const messages = container.querySelectorAll('.jse-message');
        const buttons = container.querySelectorAll('.jse-button');

        if (statusBar) translateText(statusBar);
        messages.forEach(msg => translateText(msg));
        buttons.forEach(btn => {
            translateText(btn);
            // Traduire aussi l'attribut title
            const title = btn.getAttribute('title');
            if (title) {
                const translatedTitle = translateString(title);
                if (translatedTitle !== title) {
                    btn.setAttribute('title', translatedTitle);
                }
            }
        });

        // Réactiver l'observer
        this.translationObserver?.observe(container, {
            childList: true,
            subtree: true
        });
    }

    /**
     * Récupère le contenu texte de l'éditeur
     */
    private getEditorText(): string {
        if (!this.jsonEditor) return '';
        const content = this.jsonEditor.get() as TextContent;
        return content.text || '';
    }

    /**
     * Définit le contenu texte de l'éditeur
     */
    private setEditorText(text: string): void {
        this.jsonEditor?.set({ text });
    }

    /**
     * Formate le JSON avec indentation
     */
    beautifyJson(): void {
        const text = this.getEditorText();
        if (!text.trim()) return;

        try {
            // Correction : Ajout de guillemets autour des nombres en tant que clés
            const fixedJsonString = text.replace(/(\{|,)\s*(\d+)\s*:/g, '$1 "$2":');
            const parsedJson = JSON.parse(fixedJsonString);
            const beautified = JSON.stringify(parsedJson, null, 2);
            this.setEditorText(beautified);
        } catch (e) {
            // L'éditeur affiche déjà les erreurs de syntaxe avec leur position
            this.snackBar.open(this.translate.instant('mmn.json-formatter.json.invalid'), '', { duration: 2000 });
        }
    }

    /**
     * Copie le contenu dans le presse-papier
     */
    async copyToClipboard(): Promise<void> {
        try {
            const text = this.getEditorText();
            await navigator.clipboard.writeText(text);
            this.snackBar.open(this.translate.instant('mmn.json-formatter.button.copied'), '', { duration: 1000 });
        } catch (e) {
            console.error('Tuello: Erreur lors de la copie dans le presse-papier', e);
        }
    }

    /**
     * Vide l'éditeur
     */
    cleanInputText(): void {
        this.setEditorText('');
    }
}
