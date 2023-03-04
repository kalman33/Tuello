export class CompareResult {
  misMatchPercentage: number;
  imageDataUrl: string;

  constructor(misMatchPercentage: number, 
    imageDataUrl: string) {
    this.misMatchPercentage = misMatchPercentage;
    this.imageDataUrl = imageDataUrl;
  }

}

export class ComparisonResult {
  public actionId: string;
  public comparisonImage: string;
  public actualImage: string;
  public compareResult: CompareResult;

  constructor(actionId: string, comparisonImage: string, actualImage: string, compareResult: any) {
    this.actionId = actionId;
    this.actualImage = actualImage;
    this.compareResult = new CompareResult(compareResult.misMatchPercentage, compareResult.imageDataUrl);
    this.comparisonImage = comparisonImage;
  }
}
