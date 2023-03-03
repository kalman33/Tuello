export class CompareResult {
  misMatchPercentage: number;
  imageDataUrl: string;

}

export class ComparisonResult {
  public actionId: string;
  public comparisonImage: string;
  public actualImage: string;
  public compareResult: CompareResult;

  constructor(actionId: string, comparisonImage: string, actualImage: string, compareResult: CompareResult) {
    this.actionId = actionId;
    this.actualImage = actualImage;
    this.compareResult = compareResult;
    this.comparisonImage = comparisonImage;
  }
}
