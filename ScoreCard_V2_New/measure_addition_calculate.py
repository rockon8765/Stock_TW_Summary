import torch
import pandas as pd
import os
def percentile_torch(data,timeperiod = 50,Method = "HighValueLowScore",device = 'cpu'):

    array = data.to_numpy()
    tensor = torch.tensor(array)
    tensor = tensor.to(device)
    padded_tensor = torch.nn.functional.pad(tensor, (0, 0, timeperiod - 1, 0))
    data = padded_tensor.unfold(dimension = 0,size = timeperiod,step = 1)
    last_elements = data[:, :, -1].unsqueeze(2)

    if Method == "HighValueHighScore":
        mask = data < last_elements
    elif  Method == "HighValueLowScore":
        mask = data > last_elements

    percentile = (mask.sum(dim=2) + 1) / timeperiod
    percentile = (percentile * ~torch.isnan(data).any(dim=2))[(timeperiod-1):]
    result = torch.nn.functional.pad(percentile, (0, 0, timeperiod - 1, 0))
    return result.to('cpu')
class CalculateAdditionMeasure():
    def __init__(self):...

    @staticmethod
    def calculate_PB_Percentile(data,timeperiod = 2500,Method = "HighValueHighScore",device = 'cpu'):
        result = data.loc[:,data.columns!="日期"]
        result = percentile_torch(result,timeperiod=timeperiod,Method = Method,device = device)
        result = pd.DataFrame(result,columns = data.loc[:,data.columns!="日期"].columns)
        result.insert(0,"日期",data["日期"])
        return result
if __name__ == "__main__":

    if 1: # 計算PB 百分位
        df = pd.read_feather(os.path.join(os.path.dirname(os.path.abspath(__file__)),'CMoney_Measure','df_股價淨值比.feather'))
        pb_percentile = CalculateAdditionMeasure().calculate_PB_Percentile(df)
        pb_percentile.to_feather(os.path.join(os.path.dirname(os.path.abspath(__file__)),'CMoney_Measure','df_股價淨值比_百分位.feather'))

    print()