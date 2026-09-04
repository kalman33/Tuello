import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { Action } from '../../spy-http/models/Action';
import { Record as UiRecord } from '../../spy-http/models/Record';
import { CompressionService } from '../compression/compression.service';
import { Scenario, SCENARIOS_KEY } from './scenario.models';

/** Types d'actions non rejouables : ils n'ont de sens que dans l'éditeur Spy & Replay */
const NON_REPLAYABLE_TYPES = ['SCREENSHOT', 'COMMENT'];

@Injectable({ providedIn: 'root' })
export class ScenarioStorageService {
  private scenariosSubject = new BehaviorSubject<Scenario[]>([]);
  scenarios$ = this.scenariosSubject.asObservable();

  private loaded = false;
  private loading: Promise<Scenario[]> | null = null;

  constructor(private compressionService: CompressionService) {}

  get scenarios(): Scenario[] {
    return this.scenariosSubject.getValue();
  }

  /** Charge la liste depuis le storage. Les appels suivants réutilisent le cache. */
  async load(force = false): Promise<Scenario[]> {
    if (this.loaded && !force) {
      return this.scenarios;
    }
    // Toutes les tuiles de la mosaïque appellent load() en même temps : sans ce
    // partage, chacune déclencherait une lecture + décompression du storage.
    if (!this.loading || force) {
      this.loading = this.compressionService
        .loadCompressed<Scenario[]>(SCENARIOS_KEY)
        .then((scenarios) => {
          this.loaded = true;
          this.loading = null;
          this.scenariosSubject.next(scenarios ?? []);
          return this.scenarios;
        })
        .catch((error) => {
          this.loading = null;
          console.error('Tuello: chargement des scénarios impossible', error);
          return this.scenarios;
        });
    }
    return this.loading;
  }

  get(id: string): Scenario | null {
    return this.scenarios.find((s) => s.id === id) ?? null;
  }

  getName(id: string): string | null {
    return this.get(id)?.name ?? null;
  }

  /**
   * Crée (ou écrase, si le nom existe déjà) un scénario à partir du record courant.
   */
  async saveFromRecord(name: string, record: UiRecord): Promise<Scenario> {
    const scenarios = [...(await this.load())];
    const existing = scenarios.find((s) => s.name === name);

    const scenario: Scenario = {
      id: existing?.id ?? crypto.randomUUID(),
      name,
      createdAt: Date.now(),
      windowSize: record?.windowSize,
      actions: this.toReplayableActions(record?.actions)
    };

    if (existing) {
      scenarios[scenarios.indexOf(existing)] = scenario;
    } else {
      scenarios.push(scenario);
    }
    await this.persist(scenarios);
    return scenario;
  }

  async rename(id: string, name: string): Promise<void> {
    const scenarios = (await this.load()).map((s) => (s.id === id ? { ...s, name } : s));
    await this.persist(scenarios);
  }

  async delete(id: string): Promise<void> {
    const scenarios = (await this.load()).filter((s) => s.id !== id);
    await this.persist(scenarios);
  }

  /**
   * Ajoute des scénarios venant d'un fichier d'import.
   * Un scénario déjà connu (même id) n'est pas écrasé : le contenu local prime,
   * et les associations importées restent valides puisque l'id existe.
   * Un nom déjà pris est suffixé pour rester distinguable dans les listes.
   *
   * @returns le nombre de scénarios réellement ajoutés
   */
  async importScenarios(imported: Scenario[]): Promise<number> {
    if (!imported?.length) {
      return 0;
    }
    const scenarios = [...(await this.load())];
    const knownIds = new Set(scenarios.map((s) => s.id));
    let added = 0;

    for (const scenario of imported) {
      if (!scenario?.id || knownIds.has(scenario.id)) {
        continue;
      }
      scenarios.push({
        ...scenario,
        name: this.uniqueName(scenario.name, scenarios),
        actions: this.toReplayableActions(scenario.actions)
      });
      knownIds.add(scenario.id);
      added++;
    }

    if (added > 0) {
      await this.persist(scenarios);
    }
    return added;
  }

  /** Suffixe un nom déjà utilisé : « Login », « Login (2) », « Login (3) »… */
  private uniqueName(name: string, scenarios: Scenario[]): string {
    const taken = new Set(scenarios.map((s) => s.name));
    if (!taken.has(name)) {
      return name;
    }
    let index = 2;
    while (taken.has(`${name} (${index})`)) {
      index++;
    }
    return `${name} (${index})`;
  }

  /**
   * Ne conserve que les actions rejouables et retire les images base64 : elles ne
   * servent qu'à la comparaison visuelle, absente du rejeu d'un scénario.
   * La navigation initiale de l'enregistrement est conservée : elle sert quand on
   * recharge le scénario dans Spy & Replay. C'est le rejeu depuis la mosaïque qui
   * l'écarte, sa navigation étant déjà assurée par l'URL de la tuile.
   */
  private toReplayableActions(actions: Action[]): Action[] {
    return (actions ?? []).filter((action) => !NON_REPLAYABLE_TYPES.includes(action.actionType)).map(({ data, ...action }) => action as Action);
  }

  private async persist(scenarios: Scenario[]): Promise<void> {
    await this.compressionService.saveCompressed(SCENARIOS_KEY, scenarios);
    this.scenariosSubject.next(scenarios);
  }
}
