/**
 * Description de l'élément visé par une action (clic, saisie), prise à l'enregistrement.
 *
 * Elle sert surtout à l'export Playwright, qui désigne les éléments comme un utilisateur
 * les voit (rôle, libellé, texte) plutôt que par leur position, pour des tests qui
 * survivent aux évolutions de la mise en page. Le rejeu Tuello garde coordonnées et
 * sélecteur CSS ; en rejeu accéléré, il s'en sert seulement pour savoir QUAND cliquer
 * (cible affichée), jamais pour choisir où (matchesTarget).
 */
export interface ITargetDescriptor {
  /** Balise de l'élément décrit (après remontée vers l'élément cliquable) */
  tag: string;
  /** Type d'un `<input>` : un mot de passe n'est jamais exporté en clair */
  inputType?: string;
  /** Valeur de `data-testid`, si elle désigne l'élément de façon unique */
  testId?: string;
  /** Rôle ARIA, explicite ou implicite (button, link, checkbox...) */
  role?: string;
  /** Nom accessible associé au rôle */
  name?: string;
  /** Libellé d'un champ (`<label>` associé ou `aria-label`) */
  label?: string;
  /** Placeholder d'un champ */
  placeholder?: string;
  /** Texte visible de l'élément */
  text?: string;
  /** Sélecteur CSS unique, en dernier recours */
  selector?: string;
  /**
   * Rang de l'élément parmi ceux de même rôle et même nom, quand ce couple n'est pas
   * unique dans la page : l'export ajoute `.nth(n)`.
   */
  roleNth?: number;
  /** Rang de l'élément parmi ceux qui affichent le même texte, quand il n'est pas unique */
  textNth?: number;
}
