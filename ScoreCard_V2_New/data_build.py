import pandas as pd
import os
import shutil

def move_csv_files(source_directory, destination_directory):
    # 移動檔案
    if not os.path.exists(destination_directory):
        os.makedirs(destination_directory)

    for filename in os.listdir(source_directory):
        if filename.endswith('.csv'):
            source_path = os.path.join(source_directory, filename)
            destination_path = os.path.join(destination_directory, filename)
            shutil.move(source_path, destination_path)
            print(f"Moved {filename} to {destination_directory}")
def get_csv_filenames_ending(directory):
    csv_files_endings = []
    for filename in os.listdir(directory):
        if filename.endswith('.csv'):
            csv_files_endings.append(filename)
    return csv_files_endings

if __name__ == '__main__':
    # 使用例子
    source_directory = 'CMoneyData'
    directory_backup = 'CMoneyData_Backup'
    csv_files = get_csv_filenames_ending(source_directory)
    # csv_files = ['small_日收盤表排行_20240715.csv','small_日常用技術指標表_均線(非還原)_20240715.csv','small_日報酬率比較表_20240715.csv','small_月營收(成長與達成率)_20240715.csv','small_季IFRS財報(財務比率)_20240715.csv']
    # csv_files = ['small_日收盤表排行_20240715.csv']
    # move_csv_files(source_directory, destination_directory)
    encodings = ['cp950','utf-8', 'utf-8-sig','big5', 'latin1']
    for csv_file in csv_files:
        for encoding in encodings:
            try:
                df = pd.read_csv(os.path.join(os.getcwd(),source_directory,csv_file), encoding=encoding)
                print(f"Successfully read the file with encoding: {encoding}")
                break
            except UnicodeDecodeError as e:
                print(f"Failed to read the file with encoding: {encoding}. Error: {e}")
        else:
            raise ValueError("Unable to read the file with the provided encodings.")

        dataframes = {}

        dates = df.iloc[:, 0]

        for col in df.columns[3:]:
            # Create a new DataFrame for each column
            temp_df = pd.DataFrame({
                '日期': dates,
                'Ticker': df.iloc[:, 1],
                'Value': df[col]
            })

            pivot_df = temp_df.pivot(index='日期', columns='Ticker', values='Value').reset_index()
            dataframes[col] = pivot_df


        for key, df in dataframes.items():
            print(f"DataFrame for {key}:")
            df.to_csv(os.path.join('CMoney_Measure', f"df_{key}.csv"), index=False, encoding='utf-8-sig')
