export class CompareResult {
  isSameDimensions: boolean;
  misMatchPercentage: number;
  imageDataUrl: string;

  constructor(isSameDimensions: boolean, misMatchPercentage: number, 
    imageDataUrl: string) {
    this.isSameDimensions = isSameDimensions;
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
    this.compareResult = new CompareResult(compareResult.isSameDimensions, compareResult.misMatchPercentage, compareResult.getImageDataUrl());
    this.comparisonImage = comparisonImage;
  }
}
