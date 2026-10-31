/**
 * Description de l'élément visé par une action (clic, saisie), prise à l'enregistrement.
 *
 * Elle sert à l'export Playwright, qui désigne les éléments comme un utilisateur les voit
 * (rôle, libellé, texte) plutôt que par leur position, pour des tests qui survivent aux
 * évolutions de la mise en page.
 *
 * Elle sert aussi au rejeu Tuello à retrouver la cible : si l'élément affiché aux
 * coordonnées enregistrées n'est plus celui-ci (matchesTarget), il est cherché dans la
 * page par ces critères (findByDescriptor), et la position enregistrée ne sert plus que
 * de repli. En rejeu accéléré, elle dit aussi QUAND la cible est affichée.
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
