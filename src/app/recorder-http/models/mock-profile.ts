export interface MockProfile {
  id: string;
  name: string;
  mocks: any[];
  createdAt: number;
  updatedAt: number;
}

export interface MockProfilesStorage {
  profiles: MockProfile[];
  activeProfileId: string;
}
