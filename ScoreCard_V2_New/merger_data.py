import pandas as pd
import os

# 定義資料夾路徑
folder_path = 'path/to/your/folder'

# 歷史資料檔案名稱
historical_data_filename = 'small_日收盤表排行.csv'
historical_data_filepath = os.path.join(folder_path, historical_data_filename)

# 讀取歷史資料的CSV檔案
historical_data = pd.read_csv(historical_data_filepath)

# 從資料夾中找到每日更新的CSV檔案
new_data_filename = None
for file in os.listdir(folder_path):
    if file.startswith('small_日收盤表排行_') and file.endswith('.feather'):
        new_data_filename = file
        break

if new_data_filename is None:
    raise FileNotFoundError("找不到每日更新的CSV檔案")

new_data_filepath = os.path.join(folder_path, new_data_filename)

# 讀取每日更新的CSV檔案
new_data = pd.read_csv(new_data_filepath)

# 設定"日期"和"股票代號"作為索引
historical_data.set_index(['日期', '股票代號'], inplace=True)
new_data.set_index(['日期', '股票代號'], inplace=True)

# 合併資料，忽略重複部分
combined_data = pd.concat([historical_data, new_data[~new_data.index.isin(historical_data.index)]])

# 重置索引
combined_data.reset_index(inplace=True)

# 將合併後的資料儲存回歷史資料的CSV檔案
combined_data.to_csv(historical_data_filepath, index=False)

print(f"合併完成並已保存到 {historical_data_filepath}")
