import pandas as pd
class BuildReasearcherDividendFile():
    def __init__(self, file_path):
        self.file_path = file_path

    def build(self):

        # 讀取Excel檔案
        # file_path = self.file_path
        result = pd.DataFrame()
        for file_path in self.file_path:
            if file_path.startswith('個股建議彙總'):
                run_sub_for = 1
            elif file_path.startswith('庫存'):
                run_sub_for = 2
            for i in range(run_sub_for):
                if file_path.startswith('個股建議彙總'):
                    df = pd.read_excel(file_path, sheet_name='報表', header=None)
                elif file_path.startswith('庫存'):
                    if i==0:
                        df = pd.read_excel(file_path, sheet_name='F14', header=None)
                    elif i==1:
                        df = pd.read_excel(file_path, sheet_name='F18', header=None)
                # 處理合併欄位（例如第四列有合併兩欄位）
                # 假設合併儲存格在第4列的第2和第3欄位
                # 使用填補的方法處理合併的儲存格
                df.iloc[3] = df.iloc[3].ffill()

                # 設定第四列和第五列為 DataFrame 的 column 名稱
                df.columns = df.iloc[3:5].apply(lambda x: '_'.join(x.dropna()), axis=0)

                # 刪除已用作 column 名稱的列
                df = df.drop([3, 4])
                # 過濾包含 "現金殖利率" 的欄位
                cash_yield_columns = df.filter(like='現金殖利率').columns.tolist()

                # 包含 "個股資訊_代碼" 的欄位
                stock_code_column = df.filter(like='個股資訊_代碼').columns.tolist()

                # 合併結果
                selected_columns =  stock_code_column + cash_yield_columns

                # 選擇這些欄位的DataFrame
                filtered_df = df[selected_columns]
                filtered_df.rename(columns={'個股資訊_代碼': 'Ticker'})
                filtered_df = filtered_df.rename(columns={'個股資訊_代碼': 'Ticker'})
                filtered_df.columns = [col.replace(' ','') for col in filtered_df.columns]
                filtered_df.columns = [col.replace('現金殖利率(%)','現金殖利率(%)_研究員推估') for col in filtered_df.columns]
                result = pd.concat([result,filtered_df],axis= 0)
        result.to_csv('dividend_reasearcher.csv', index=False) # result.loc[result['Ticker'] =='5483',:]
if __name__ == '__main__':
    if 0:
        file_path = ['個股建議彙總.xlsx']
        BuildReasearcherDividendFile(file_path).build()
    if 1:
        file_path = ['個股建議彙總.xlsx','庫存.xlsx']
        BuildReasearcherDividendFile(file_path).build()
