from data_build import *
from rule_build import *
import Equity168 # 自定義
from build_report_show import build_show_report
import BuildReasearcherDividendFile as BuildReasearcherDividendFile
import measure_addition_calculate as measure_addition_calculate
if 1: # 整理資料
    # 使用例子
    source_directory = 'CMoneyData'
    destination_directory = 'CMoneyData_Backup'
    csv_files = get_csv_filenames_ending(source_directory)
    # csv_files = ['small_日收盤表排行_20240715.csv','small_日常用技術指標表_均線(非還原)_20240715.csv','small_日報酬率比較表_20240715.csv','small_月營收(成長與達成率)_20240715.csv','small_季IFRS財報(財務比率)_20240715.csv']
    # csv_files = ['small_日收盤表排行_20240715.csv']

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
            df.columns = df.columns.astype(str)
            df.to_feather(os.path.join('CMoney_Measure', f"df_{key}.feather"))
if 1: # 計算額外的measure
    df = pd.read_feather(os.path.join(os.path.dirname(os.path.abspath(__file__)),'CMoney_Measure','df_股價淨值比.feather'))
    pb_percentile = measure_addition_calculate.CalculateAdditionMeasure().calculate_PB_Percentile(df)
    pb_percentile.to_feather(os.path.join(os.path.dirname(os.path.abspath(__file__)),'CMoney_Measure','df_股價淨值比_百分位.feather'))


if 1:
    close = get_measure_data("收盤價")
    close = pd.DataFrame(close.iloc[-1,:].T)
    close.columns = ['收盤價']

    payout_ratio = get_measure_data("股利發放率(%)") * 0.01
    payout_ratio_mean = pd.DataFrame(payout_ratio.T.iloc[:,-2:].mean(axis =1))
    payout_ratio_mean.columns = ['發放率']
    # divided = pd.DataFrame(get_measure_data("公告累計基本每股盈餘(元)").iloc[-2:,:])
    # quartrt = int(str(divided.columns[0])[-1:])
    # if quartrt == 1: # 第一季
    #     divided = divided * 4
    # elif quartrt == 2:# 第二季
    #     divided = divided * 2
    # elif quartrt == 3:# 第三季
    #     divided = divided * 4/3

    divided = pd.DataFrame(get_measure_data("公告累計基本每股盈餘(元)"))
    least_row = divided.shape[0]-1
    divided_result = []
    for i in range(divided.shape[1]):
        if pd.isna(divided.iloc[least_row,i]):
            quartrt = int(str(divided.index[least_row]-1)[-1])
            if quartrt == 1: # 第一季
                divided_result.append(divided.iloc[least_row-1,i] * 4)
            elif quartrt == 2:# 第二季
                divided_result.append(divided.iloc[least_row-1,i] * 2)
            elif quartrt == 3:# 第三季
                divided_result.append(divided.iloc[least_row-1,i] * 4/3)
            elif quartrt == 0:# 第四季
                divided_result.append(divided.iloc[least_row-1,i])

        else:
            quartrt = int(str(divided.index[least_row])[-1])
            if quartrt == 1: # 第一季
                divided_result.append(divided.iloc[least_row,i] * 4)
            elif quartrt == 2:# 第二季
                divided_result.append(divided.iloc[least_row,i]  * 2)
            elif quartrt == 3:# 第三季
                divided_result.append(divided.iloc[least_row,i]  * 4/3)
            elif quartrt == 4:# 第四季
                divided_result.append(divided.iloc[least_row,i] )
    # 對每一檔逐一處理每一列數據

    divided = pd.DataFrame(divided_result,index = divided.columns)

    divided.columns = ['累計股利']
    predict = divided.merge(payout_ratio_mean, left_index=True, right_index=True)
    predict = predict.merge(close, left_index=True, right_index=True)
    predict['發放率'] = predict['發放率'].clip(lower=0, upper=100)
    predict['預估EPS'] = predict['累計股利'] * predict['發放率']
    predict['預估殖利率'] = round(predict['預估EPS'] / predict['收盤價'] * 100,2)
    predict['預估殖利率'] = predict['預估殖利率'].clip(lower=0)
    predict.to_csv('dividend_cmoney.csv',encoding = 'utf-8-sig')
    print()

if 0: # 整理研究員資料 # 通常關閉
    file_path = ['個股建議彙總.xlsx','庫存.xlsx']
    # 產生 dividend_reasearcher
    obj_BuildReasearcherDividendFile = BuildReasearcherDividendFile.BuildReasearcherDividendFile(file_path).build()
    print()



if 1:
    if 1:
        # sell_signals = ['S10','S11','S12','S13']
        # buy_signals = []
        buy_signals = ['B0','B1','B2','B3','B4','B5','B6','B7','B8','B9']
        sell_signals = ['S0','S1','S2','S3','S4','S5','S6','S7','S8','S9','S10','S11','S12','S13','S14','S15','S16','S17','S18','S19','S20','S21','S22']

        build_rule_list(buy_signals,sell_signals)
        del buy_signals,sell_signals

    if 1: # 產生Eason監控的第二版表
        print("---產生監控的表2---")

        buy_signals = []
        sell_signals = ['S10','S11','S12','S13','S20','S22','S17']
        buy_signals_weights = []
        sell_signals_weights = [-1,-1,-1,-1,-1,-1,-1]
        # build_rule_list(buy_signals,sell_signals)
        assert len(buy_signals) == len(buy_signals_weights), "The number of buy signals and their weights must be the same."
        assert len(sell_signals) == len(sell_signals_weights), "The number of sell signals and their weights must be the same."
        close = get_measure_data("收盤價")
        ticker_list = list(close.columns)
        # ticker_list = ['1101','1102','1301','1326','1402','2101','2105','2106','2227','2258','2301']

        signal = buy_signals + sell_signals
        weights = buy_signals_weights + sell_signals_weights
        # ['B0','B1','B2','B3','B4','S0','S2','S1','S3','S4']

        combinedata(ticker_list,signal,weights,user = 'Eason篩選表V2',long_short = ['Short'],strategy_list = ['strategy_1','strategy_2','strategy_3'])
        combinedata_week(ticker_list,user = 'Eason篩選表V2')
        combinedata_daily(ticker_list,user = 'Eason篩選表V2',strategy_list = ['strategy_1','strategy_2','strategy_3'])
        combinedata_performance(ticker_list,user = 'Eason篩選表V2')
        build_show_report('Result_Current_Eason篩選表V2').build()
        build_show_report('Result_Back_Eason篩選表V2').build()

        my_file_path= os.path.join('Result','Result_Current_Eason篩選表V2_Show.feather')
        target_url = 'https://docs.google.com/spreadsheets/d/16zY-gkampDFCcOwKMvekLo0lVRlEgOc5s15Ag83JlME/edit?gid=1109596478#gid=1109596478'
        target_sheetname='Table_Eason_Watch_殖利率'
        Equity168.Upload2Gspread(my_file_path,target_url,target_sheetname, replace_values=False)

        # my_file_path= os.path.join('Result','Result_Back_Eason篩選表V2_Show.feather')
        # target_url = 'https://docs.google.com/spreadsheets/d/16zY-gkampDFCcOwKMvekLo0lVRlEgOc5s15Ag83JlME/edit?gid=1109596478#gid=1109596478'
        # target_sheetname='Data_Table_Eason_Watch_殖利率'
        # Equity168.Upload2Gspread(my_file_path,target_url,target_sheetname, replace_values=False)

        if 1:
            # show_label_df = pd.read_excel("Show.xlsx", sheet_name='Show', header=0)
            show_label_df = pd.read_csv("Show.csv",encoding = "big5")
            my_file_path= os.path.join('Result','Result_Current_Eason篩選表V2_Show.feather')
            df = pd.read_feather(my_file_path)
            df = df.rename(columns={'分數': '警示次數'})
            df_sub = df.loc[(df['分類'] == "殖利率"), :]
            df_sub.index.name = 'index'
            df_sub = df_sub.sort_values(by='警示次數', ascending=False)
            show_list = list(show_label_df.loc[(show_label_df['分類'] == "殖利率"),'代碼'])
            show_list = list(map(str, show_list))
            df_sub = df_sub[df_sub['標的代號'].isin(show_list)]

            # 設定報表順序跟sell_signals一樣
            buy_dict, sell_dict = get_rule_dictionary()
            mapping = {}
            for _, (code, text) in sell_dict.items():
                mapping[code] = text
            ordered_signal_cols = [mapping.get(s) for s in sell_signals if mapping.get(s) in df_sub.columns]
            front_cols = ['日期', '標的代號', '標的名稱', '收盤價']
            back_cols = ['警示次數', '預估殖利率_財報推估(%)', '代碼', '分類']
            final_cols = front_cols + ordered_signal_cols + back_cols
            df_sub = df_sub[final_cols]
            df_sub.to_feather(os.path.join("Result",'Eason篩選表V2.feather'))

        my_file_path= os.path.join('Result','Eason篩選表V2.feather')
        target_url = 'https://docs.google.com/spreadsheets/d/16zY-gkampDFCcOwKMvekLo0lVRlEgOc5s15Ag83JlME/edit?gid=1109596478#gid=1109596478'
        target_sheetname='Eason_Watch_殖利率'
        Equity168.Upload2Gspread(my_file_path,target_url,target_sheetname, replace_values=False)

    if 1: # 產生Eason監控的第二版表
        print("---產生監控的表3---")

        buy_signals = []
        sell_signals = ['S10','S11','S12','S13','S20','S22','S17']
        buy_signals_weights = []
        sell_signals_weights = [-1,-1,-1,-1,-1,-1,-1]
        # build_rule_list(buy_signals,sell_signals)
        assert len(buy_signals) == len(buy_signals_weights), "The number of buy signals and their weights must be the same."
        assert len(sell_signals) == len(sell_signals_weights), "The number of sell signals and their weights must be the same."
        close = get_measure_data("收盤價")
        ticker_list = list(close.columns)
        # ticker_list = ['1101','1102','1301','1326','1402','2101','2105','2106','2227','2258','2301']

        signal = buy_signals + sell_signals
        weights = buy_signals_weights + sell_signals_weights
        # ['B0','B1','B2','B3','B4','S0','S2','S1','S3','S4']

        combinedata(ticker_list,signal,weights,user = 'Eason篩選表V2',long_short = ['Short'],strategy_list = ['strategy_1','strategy_2','strategy_3'])
        combinedata_week(ticker_list,user = 'Eason篩選表V2')
        combinedata_daily(ticker_list,user = 'Eason篩選表V2',strategy_list = ['strategy_1','strategy_2','strategy_3'])
        combinedata_performance(ticker_list,user = 'Eason篩選表V2')
        build_show_report('Result_Current_Eason篩選表V2').build()
        build_show_report('Result_Back_Eason篩選表V2').build()

        my_file_path= os.path.join('Result','Result_Current_Eason篩選表V2_Show.feather')
        target_url = 'https://docs.google.com/spreadsheets/d/16zY-gkampDFCcOwKMvekLo0lVRlEgOc5s15Ag83JlME/edit?gid=1109596478#gid=1109596478'
        target_sheetname='Table_Eason_Watch_景氣循環'
        Equity168.Upload2Gspread(my_file_path,target_url,target_sheetname, replace_values=False)

        # my_file_path= os.path.join('Result','Result_Back_Eason篩選表V2_Show.feather')
        # target_url = 'https://docs.google.com/spreadsheets/d/16zY-gkampDFCcOwKMvekLo0lVRlEgOc5s15Ag83JlME/edit?gid=1109596478#gid=1109596478'
        # target_sheetname='Data_Table_Eason_Watch_景氣循環'
        # Equity168.Upload2Gspread(my_file_path,target_url,target_sheetname, replace_values=False)

        if 1:
            # show_label_df = pd.read_excel("Show.xlsx", sheet_name='Show', header=0)
            show_label_df = pd.read_csv("Show.csv",encoding = "big5")
            my_file_path= os.path.join('Result','Result_Current_Eason篩選表V2_Show.feather')
            df = pd.read_feather(my_file_path)
            df = df.rename(columns={'分數': '警示次數'})
            df_sub = df.loc[(df['分類'] == "景氣循環"), :]
            df_sub.index.name = 'index'
            df_sub = df_sub.sort_values(by='警示次數', ascending=False)
            show_list = list(show_label_df.loc[(show_label_df['分類'] == "景氣循環"),'代碼'])
            show_list = list(map(str, show_list))
            df_sub = df_sub[df_sub['標的代號'].isin(show_list)]
            # 設定報表順序跟sell_signals一樣
            buy_dict, sell_dict = get_rule_dictionary()
            mapping = {}
            for _, (code, text) in sell_dict.items():
                mapping[code] = text
            ordered_signal_cols = [mapping.get(s) for s in sell_signals if mapping.get(s) in df_sub.columns]
            front_cols = ['日期', '標的代號', '標的名稱', '收盤價']
            back_cols = ['警示次數', '預估殖利率_財報推估(%)', '代碼', '分類']
            final_cols = front_cols + ordered_signal_cols + back_cols
            df_sub = df_sub[final_cols]
            df_sub.to_feather(os.path.join("Result",'Eason篩選表V2.feather'))

        my_file_path= os.path.join('Result','Eason篩選表V2.feather')
        target_url = 'https://docs.google.com/spreadsheets/d/16zY-gkampDFCcOwKMvekLo0lVRlEgOc5s15Ag83JlME/edit?gid=1109596478#gid=1109596478'
        target_sheetname='Eason_Watch_景氣循環'
        Equity168.Upload2Gspread(my_file_path,target_url,target_sheetname, replace_values=False)
    if 1: # 產生Eason監控的第二版表
        print("---產生監控的表3---")

        buy_signals = []
        sell_signals = ['S10','S11','S12','S13','S20','S22','S17']
        buy_signals_weights = []
        sell_signals_weights = [-1,-1,-1,-1,-1,-1,-1]
        # build_rule_list(buy_signals,sell_signals)
        assert len(buy_signals) == len(buy_signals_weights), "The number of buy signals and their weights must be the same."
        assert len(sell_signals) == len(sell_signals_weights), "The number of sell signals and their weights must be the same."
        close = get_measure_data("收盤價")
        ticker_list = list(close.columns)
        # ticker_list = ['1101','1102','1301','1326','1402','2101','2105','2106','2227','2258','2301']

        signal = buy_signals + sell_signals
        weights = buy_signals_weights + sell_signals_weights
        # ['B0','B1','B2','B3','B4','S0','S2','S1','S3','S4']

        combinedata(ticker_list,signal,weights,user = 'Eason篩選表V2',long_short = ['Short'],strategy_list = ['strategy_1','strategy_2','strategy_3'])
        combinedata_week(ticker_list,user = 'Eason篩選表V2')
        combinedata_daily(ticker_list,user = 'Eason篩選表V2',strategy_list = ['strategy_1','strategy_2','strategy_3'])
        combinedata_performance(ticker_list,user = 'Eason篩選表V2')
        build_show_report('Result_Current_Eason篩選表V2').build()
        build_show_report('Result_Back_Eason篩選表V2').build()

        my_file_path= os.path.join('Result','Result_Current_Eason篩選表V2_Show.feather')
        target_url = 'https://docs.google.com/spreadsheets/d/16zY-gkampDFCcOwKMvekLo0lVRlEgOc5s15Ag83JlME/edit?gid=1109596478#gid=1109596478'
        target_sheetname='Table_Eason_Watch_中長期'
        Equity168.Upload2Gspread(my_file_path,target_url,target_sheetname, replace_values=False)

        # my_file_path= os.path.join('Result','Result_Back_Eason篩選表V2_Show.feather')
        # target_url = 'https://docs.google.com/spreadsheets/d/16zY-gkampDFCcOwKMvekLo0lVRlEgOc5s15Ag83JlME/edit?gid=1109596478#gid=1109596478'
        # target_sheetname='Data_Table_Eason_Watch_中長期'
        # Equity168.Upload2Gspread(my_file_path,target_url,target_sheetname, replace_values=False)

        if 1:
            # show_label_df = pd.read_excel("Show.xlsx", sheet_name='Show', header=0)
            show_label_df = pd.read_csv("Show.csv",encoding = "big5")
            my_file_path= os.path.join('Result','Result_Current_Eason篩選表V2_Show.feather')
            df = pd.read_feather(my_file_path)
            df = df.rename(columns={'分數': '警示次數'})
            df_sub = df.loc[(df['分類'] == "中長期"), :]
            df_sub.index.name = 'index'
            df_sub = df_sub.sort_values(by='警示次數', ascending=False)
            show_list = list(show_label_df.loc[(show_label_df['分類'] == "中長期"),'代碼'])
            show_list = list(map(str, show_list))
            df_sub = df_sub[df_sub['標的代號'].isin(show_list)]
            # 設定報表順序跟sell_signals一樣
            buy_dict, sell_dict = get_rule_dictionary()
            mapping = {}
            for _, (code, text) in sell_dict.items():
                mapping[code] = text
            ordered_signal_cols = [mapping.get(s) for s in sell_signals if mapping.get(s) in df_sub.columns]
            front_cols = ['日期', '標的代號', '標的名稱', '收盤價']
            back_cols = ['警示次數', '預估殖利率_財報推估(%)', '代碼', '分類']
            final_cols = front_cols + ordered_signal_cols + back_cols
            df_sub = df_sub[final_cols]
            df_sub.to_feather(os.path.join("Result",'Eason篩選表V2.feather'))

        my_file_path= os.path.join('Result','Eason篩選表V2.feather')
        target_url = 'https://docs.google.com/spreadsheets/d/16zY-gkampDFCcOwKMvekLo0lVRlEgOc5s15Ag83JlME/edit?gid=1109596478#gid=1109596478'
        target_sheetname='Eason_Watch_中長期'
        Equity168.Upload2Gspread(my_file_path,target_url,target_sheetname, replace_values=False)

    if 0: # 產生監控的表
        print("---產生監控的表---")

        buy_signals = []
        sell_signals = ['S10','S11','S12','S13']
        buy_signals_weights = []
        sell_signals_weights = [-1,-1,-1,-1]
        # build_rule_list(buy_signals,sell_signals)
        assert len(buy_signals) == len(buy_signals_weights), "The number of buy signals and their weights must be the same."
        assert len(sell_signals) == len(sell_signals_weights), "The number of sell signals and their weights must be the same."
        close = get_measure_data("收盤價")
        ticker_list = list(close.columns)
        # ticker_list = ['1101','1102','1301','1326','1402','2101','2105','2106','2227','2258','2301']

        signal = buy_signals + sell_signals
        weights = buy_signals_weights + sell_signals_weights
        # ['B0','B1','B2','B3','B4','S0','S2','S1','S3','S4']

        combinedata(ticker_list,signal,weights,user = '殖利率檢核表',long_short = ['Short'],strategy_list = ['strategy_1','strategy_2','strategy_3'])
        combinedata_week(ticker_list,user = '殖利率檢核表')
        combinedata_daily(ticker_list,user = '殖利率檢核表',strategy_list = ['strategy_1','strategy_2','strategy_3'])
        combinedata_performance(ticker_list,user = '殖利率檢核表')
        build_show_report('Result_Current_殖利率檢核表').build()
        build_show_report('Result_Back_殖利率檢核表').build()

        my_file_path= os.path.join('Result','Result_Current_殖利率檢核表_Show.feather')
        target_url = 'https://docs.google.com/spreadsheets/d/16zY-gkampDFCcOwKMvekLo0lVRlEgOc5s15Ag83JlME/edit?gid=1109596478#gid=1109596478'
        target_sheetname='Table'
        Equity168.Upload2Gspread(my_file_path,target_url,target_sheetname, replace_values=False)

        my_file_path= os.path.join('Result','Result_Back_殖利率檢核表_Show.feather')
        target_url = 'https://docs.google.com/spreadsheets/d/16zY-gkampDFCcOwKMvekLo0lVRlEgOc5s15Ag83JlME/edit?gid=1109596478#gid=1109596478'
        target_sheetname='Data_Table'
        Equity168.Upload2Gspread(my_file_path,target_url,target_sheetname, replace_values=False)



        if 1:
            # show_label_df = pd.read_excel("Show.xlsx", sheet_name='Show', header=0)
            show_label_df = pd.read_csv("Show.csv",encoding = "big5")
            my_file_path= os.path.join('Result','Result_Current_殖利率檢核表_Show.feather')
            df = pd.read_feather(my_file_path)
            df = df.rename(columns={'分數': '警示次數'})
            df_sub = df.loc[df['分類']=="殖利率",:]
            df_sub.index.name = 'index'
            df_sub = df_sub.sort_values(by='警示次數', ascending=False)
            show_list = list(show_label_df.loc[show_label_df['分類'] == "殖利率",'代碼'])
            show_list = list(map(str, show_list))
            df_sub = df_sub[df_sub['標的代號'].isin(show_list)]
            df_sub.to_feather(os.path.join("Result",'殖利率.feather'))



        my_file_path= os.path.join('Result','殖利率.feather')
        target_url = 'https://docs.google.com/spreadsheets/d/16zY-gkampDFCcOwKMvekLo0lVRlEgOc5s15Ag83JlME/edit?gid=1109596478#gid=1109596478'
        target_sheetname='殖利率'
        Equity168.Upload2Gspread(my_file_path,target_url,target_sheetname, replace_values=False)

    if 1:

        print("---產生景氣循環監控的表---")

        buy_signals = []
        sell_signals = ['S0','S1','S2','B5','S14','S15','S17','S18']
        buy_signals_weights = []
        sell_signals_weights = [-1,-1,-1,-1,-1,-1,-1,-1]
        # build_rule_list(buy_signals,sell_signals)
        assert len(buy_signals) == len(buy_signals_weights), "The number of buy signals and their weights must be the same."
        assert len(sell_signals) == len(sell_signals_weights), "The number of sell signals and their weights must be the same."
        close = get_measure_data("收盤價")
        ticker_list = list(close.columns)
        # ticker_list = ['1101','1102','1301','1326','1402','2101','2105','2106','2227','2258','2301']

        signal = buy_signals + sell_signals
        weights = buy_signals_weights + sell_signals_weights
        # ['B0','B1','B2','B3','B4','S0','S2','S1','S3','S4']

        combinedata(ticker_list,signal,weights,user = '殖利率檢核表_景氣循環',long_short = ['Short'],strategy_list = ['strategy_1','strategy_2','strategy_3'])
        combinedata_week(ticker_list,user = '殖利率檢核表_景氣循環')
        combinedata_daily(ticker_list,user = '殖利率檢核表_景氣循環',strategy_list = ['strategy_1','strategy_2','strategy_3'])
        combinedata_performance(ticker_list,user = '殖利率檢核表_景氣循環')
        build_show_report('Result_Current_殖利率檢核表_景氣循環').build()
        build_show_report('Result_Back_殖利率檢核表_景氣循環').build()

        my_file_path= os.path.join('Result','Result_Current_殖利率檢核表_景氣循環_Show.feather')
        target_url = 'https://docs.google.com/spreadsheets/d/16zY-gkampDFCcOwKMvekLo0lVRlEgOc5s15Ag83JlME/edit?gid=1109596478#gid=1109596478'
        target_sheetname='Table_中長期'
        Equity168.Upload2Gspread(my_file_path,target_url,target_sheetname, replace_values=False)

        my_file_path= os.path.join('Result','Result_Current_殖利率檢核表_景氣循環_Show.feather')
        df = pd.read_feather(my_file_path)
        df = df.rename(columns={'分數': '警示次數'})

        if 1:
            # show_label_df = pd.read_excel("Show.xlsx", sheet_name='Show', header=0)
            show_label_df = pd.read_csv("Show.csv",encoding = "big5")
            my_file_path= os.path.join('Result','Result_Current_殖利率檢核表_景氣循環_Show.feather')
            df = pd.read_feather(my_file_path)
            df = df.rename(columns={'分數': '警示次數'})
            df_sub = df.loc[df['分類']=="景氣循環",:]
            df_sub.index.name = 'index'
            df_sub = df_sub.sort_values(by='警示次數', ascending=False)
            show_list = list(show_label_df.loc[show_label_df['分類'] == "景氣循環",'代碼'])
            show_list = list(map(str, show_list))
            df_sub = df_sub[df_sub['標的代號'].isin(show_list)]
            df_sub.to_feather(os.path.join("Result",'景氣循環.feather'))

        my_file_path= os.path.join('Result','景氣循環.feather')
        target_url = 'https://docs.google.com/spreadsheets/d/16zY-gkampDFCcOwKMvekLo0lVRlEgOc5s15Ag83JlME/edit?gid=1109596478#gid=1109596478'
        target_sheetname='景氣循環'
        Equity168.Upload2Gspread(my_file_path,target_url,target_sheetname, replace_values=False)

    if 0: # 整理上傳資料 Eason的
        print("---開始處理預設---")
        buy_signals = ['B0','B1','B2','B3','B4']
        sell_signals = ['S0','S1','S2','S3','S4']
        buy_signals_weights = [1,1,1,1,1]
        sell_signals_weights = [-1,-1,-1,-1,-1]
        # build_rule_list(buy_signals,sell_signals)
        assert len(buy_signals) == len(buy_signals_weights), "The number of buy signals and their weights must be the same."
        assert len(sell_signals) == len(sell_signals_weights), "The number of sell signals and their weights must be the same."
        close = get_measure_data("收盤價")
        ticker_list = list(close.columns)
        # ticker_list = ['1101','1102','1301','1326','1402','2101','2105','2106','2227','2258','2301']

        signal = buy_signals + sell_signals
        weights = buy_signals_weights + sell_signals_weights

        combinedata(ticker_list,signal,weights,long_short = ['Short'],strategy_list = ['strategy_1','strategy_2','strategy_3'])
        combinedata_week(ticker_list)
        combinedata_daily(ticker_list,strategy_list = ['strategy_1','strategy_2','strategy_3'])
        combinedata_performance(ticker_list)
        build_show_report('Result_Current').build()
        build_show_report('Result_Back').build()

        my_file_path= os.path.join('Result','Result_Back.feather')
        target_url = 'https://docs.google.com/spreadsheets/d/1n_jzlEJRUSkP0F7ivJ67V6SMl43gi2xVhfTW1yRopys/edit?gid=1109596478#gid=1109596478'
        target_sheetname='Data'
        Equity168.Upload2Gspread(my_file_path,target_url,target_sheetname, replace_values=False)

        my_file_path= os.path.join('Result','Result_Current.feather')
        target_url = 'https://docs.google.com/spreadsheets/d/1n_jzlEJRUSkP0F7ivJ67V6SMl43gi2xVhfTW1yRopys/edit?gid=1109596478#gid=1109596478'
        target_sheetname='CurrentData'
        Equity168.Upload2Gspread(my_file_path,target_url,target_sheetname, replace_values=False)

        my_file_path= os.path.join('Result','Result_Performance_Table.feather')
        target_url = 'https://docs.google.com/spreadsheets/d/1n_jzlEJRUSkP0F7ivJ67V6SMl43gi2xVhfTW1yRopys/edit?gid=1109596478#gid=1109596478'
        target_sheetname='Performance'
        Equity168.Upload2Gspread(my_file_path,target_url,target_sheetname, replace_values=False)

        my_file_path= os.path.join('Result','Result_Back_Daily_Trading_List.feather')
        target_url = 'https://docs.google.com/spreadsheets/d/1n_jzlEJRUSkP0F7ivJ67V6SMl43gi2xVhfTW1yRopys/edit?gid=1109596478#gid=1109596478'
        target_sheetname='Trading_List'
        Equity168.Upload2Gspread(my_file_path,target_url,target_sheetname, replace_values=False)

        my_file_path= os.path.join('Result','Result_Current_Show.feather')
        target_url = 'https://docs.google.com/spreadsheets/d/1n_jzlEJRUSkP0F7ivJ67V6SMl43gi2xVhfTW1yRopys/edit?gid=1109596478#gid=1109596478'
        target_sheetname='ReportShow'
        Equity168.Upload2Gspread(my_file_path,target_url,target_sheetname, replace_values=False)

        my_file_path= os.path.join('Result','Result_Back_Show.feather')
        target_url = 'https://docs.google.com/spreadsheets/d/1n_jzlEJRUSkP0F7ivJ67V6SMl43gi2x77VhfTW1yRopys/edit?gid=1109596478#gid=1109596478'
        target_sheetname='ReportShowHistory'
        Equity168.Upload2Gspread(my_file_path,target_url,target_sheetname, replace_values=False)

    if 1: # 整理上傳資料 Eason的
        print("---開始處理Eason_OnlySell---")

        buy_signals = []
        sell_signals = ['S0','S1','S2','S3','S4']
        buy_signals_weights = []
        sell_signals_weights = [-1,-1,-1,-1,-1]
        # build_rule_list(buy_signals,sell_signals)
        assert len(buy_signals) == len(buy_signals_weights), "The number of buy signals and their weights must be the same."
        assert len(sell_signals) == len(sell_signals_weights), "The number of sell signals and their weights must be the same."
        close = get_measure_data("收盤價")
        ticker_list = list(close.columns)
        # ticker_list = ['1101','1102','1301','1326','1402','2101','2105','2106','2227','2258','2301']

        signal = buy_signals + sell_signals
        weights = buy_signals_weights + sell_signals_weights
        # ['B0','B1','B2','B3','B4','S0','S2','S1','S3','S4']

        combinedata(ticker_list,signal,weights,user = 'Eason_OnlySell',long_short = ['Short'],strategy_list = ['strategy_1','strategy_2','strategy_3'])
        combinedata_week(ticker_list,user = 'Eason_OnlySell')
        combinedata_daily(ticker_list,user = 'Eason_OnlySell',strategy_list = ['strategy_1','strategy_2','strategy_3'])
        combinedata_performance(ticker_list,user = 'Eason_OnlySell')
        build_show_report('Result_Current_Eason_OnlySell').build()
        build_show_report('Result_Back_Eason_OnlySell').build()

        my_file_path= os.path.join('Result','Result_Back_Eason_OnlySell.feather')
        target_url = 'https://docs.google.com/spreadsheets/d/1GgPJv-aLQQA_nd-qHDn56rWn68v-HQe20bocl7mxif8/edit?gid=2020641055#gid=2020641055'
        target_sheetname='Data_OnlySell'
        Equity168.Upload2Gspread(my_file_path,target_url,target_sheetname, replace_values=False)

        my_file_path= os.path.join('Result','Result_Current_Eason_OnlySell.feather')
        target_url = 'https://docs.google.com/spreadsheets/d/1GgPJv-aLQQA_nd-qHDn56rWn68v-HQe20bocl7mxif8/edit?gid=2020641055#gid=2020641055'
        target_sheetname='CurrentData_OnlySell'
        Equity168.Upload2Gspread(my_file_path,target_url,target_sheetname, replace_values=False)

        my_file_path= os.path.join('Result','Result_Performance_Table_Eason_OnlySell.feather')
        target_url = 'https://docs.google.com/spreadsheets/d/1GgPJv-aLQQA_nd-qHDn56rWn68v-HQe20bocl7mxif8/edit?gid=2020641055#gid=2020641055'
        target_sheetname='Performance_OnlySell'
        Equity168.Upload2Gspread(my_file_path,target_url,target_sheetname, replace_values=False)

        my_file_path= os.path.join('Result','Result_Back_Daily_Trading_List_Eason_OnlySell.feather')
        target_url = 'https://docs.google.com/spreadsheets/d/1GgPJv-aLQQA_nd-qHDn56rWn68v-HQe20bocl7mxif8/edit?gid=2020641055#gid=2020641055'
        target_sheetname='Trading_List'
        Equity168.Upload2Gspread(my_file_path,target_url,target_sheetname, replace_values=False)

        my_file_path= os.path.join('Result','Result_Current_Eason_OnlySell_Show.feather')
        target_url = 'https://docs.google.com/spreadsheets/d/1GgPJv-aLQQA_nd-qHDn56rWn68v-HQe20bocl7mxif8/edit?gid=2020641055#gid=2020641055'
        target_sheetname='ReportShow'
        Equity168.Upload2Gspread(my_file_path,target_url,target_sheetname, replace_values=False)

        my_file_path= os.path.join('Result','Result_Back_Eason_OnlySell_Show.feather')
        target_url = 'https://docs.google.com/spreadsheets/d/1GgPJv-aLQQA_nd-qHDn56rWn68v-HQe20bocl7mxif8/edit?gid=2020641055#gid=2020641055'
        target_sheetname='ReportShowHistory'
        Equity168.Upload2Gspread(my_file_path,target_url,target_sheetname, replace_values=False)

    if 1: # 整理上傳資料
        print("---開始處理Calvin---")

        buy_signals = ['B5','B6','B7','B8','B9']
        sell_signals = []

        buy_signals_weights = [-1,-1,-1,-1,-1]
        sell_signals_weights = []

        # build_rule_list(buy_signals,sell_signals)
        assert len(buy_signals) == len(buy_signals_weights), "The number of buy signals and their weights must be the same."
        assert len(sell_signals) == len(sell_signals_weights), "The number of sell signals and their weights must be the same."
        close = get_measure_data("收盤價")
        ticker_list = list(close.columns)
        # ticker_list = ['1101','1102','1301','1326','1402','2101','2105','2106','2227','2258','2301']

        signal = buy_signals + sell_signals
        weights = buy_signals_weights + sell_signals_weights
        # ['B0','B1','B2','B3','B4','S0','S2','S1','S3','S4']

        combinedata(ticker_list,signal,weights,user='Calvin',long_short = ['Short'],strategy_list = ['strategy_1','strategy_2','strategy_3'])
        combinedata_week(ticker_list,user='Calvin')
        combinedata_daily(ticker_list,user='Calvin',strategy_list = ['strategy_1','strategy_2','strategy_3'])
        combinedata_performance(ticker_list,user = 'Calvin')
        build_show_report('Result_Current_Calvin').build()
        build_show_report('Result_Back_Calvin').build()

        my_file_path= os.path.join('Result','Result_Back_Calvin.feather')
        target_url = 'https://docs.google.com/spreadsheets/d/1M5UKvN9fDJ3xZPqADZO5LTfD9vPgnuTDQKowDvV3cOE/edit?gid=289812230#gid=289812230'
        target_sheetname='Data_Calvin'
        Equity168.Upload2Gspread(my_file_path,target_url,target_sheetname, replace_values=False)

        my_file_path= os.path.join('Result','Result_Current_Calvin.feather')
        target_url = 'https://docs.google.com/spreadsheets/d/1M5UKvN9fDJ3xZPqADZO5LTfD9vPgnuTDQKowDvV3cOE/edit?gid=289812230#gid=289812230'
        target_sheetname='CurrentData_Calvin'
        Equity168.Upload2Gspread(my_file_path,target_url,target_sheetname, replace_values=False)

        my_file_path= os.path.join('Result','Result_Performance_Table_Calvin.feather')
        target_url = 'https://docs.google.com/spreadsheets/d/1M5UKvN9fDJ3xZPqADZO5LTfD9vPgnuTDQKowDvV3cOE/edit?gid=289812230#gid=289812230'
        target_sheetname='Performance_Calvin'
        Equity168.Upload2Gspread(my_file_path,target_url,target_sheetname, replace_values=False)

        my_file_path= os.path.join('Result','Result_Back_Daily_Trading_List_Calvin.feather')
        target_url = 'https://docs.google.com/spreadsheets/d/1M5UKvN9fDJ3xZPqADZO5LTfD9vPgnuTDQKowDvV3cOE/edit?gid=289812230#gid=289812230'
        target_sheetname='Trading_List'
        Equity168.Upload2Gspread(my_file_path,target_url,target_sheetname, replace_values=False)

        my_file_path= os.path.join('Result','Result_Current_Calvin_Show.feather')
        target_url = 'https://docs.google.com/spreadsheets/d/1M5UKvN9fDJ3xZPqADZO5LTfD9vPgnuTDQKowDvV3cOE/edit?gid=289812230#gid=289812230'
        target_sheetname='ReportShow'
        Equity168.Upload2Gspread(my_file_path,target_url,target_sheetname, replace_values=False)

        my_file_path= os.path.join('Result','Result_Back_Calvin_Show.feather')
        target_url = 'https://docs.google.com/spreadsheets/d/1M5UKvN9fDJ3xZPqADZO5LTfD9vPgnuTDQKowDvV3cOE/edit?gid=289812230#gid=289812230'
        target_sheetname='ReportShowHistory'
        Equity168.Upload2Gspread(my_file_path,target_url,target_sheetname, replace_values=False)

    if 1: # 合併的整理上傳資料
        print("---開始處理合併---")

        buy_signals = ['S0','S1','S2','B5','S14','S15','S17','S18']
        sell_signals = []

        # buy_signals_weights = [-1/8*5,-1/8*5,-1/8*5,-1/8*5,-1/8*5,-1/8*5,-1/8*5,-1/8*5]
        buy_signals_weights = [-1,-1,-1,-1,-1,-1,-1,-1]

        sell_signals_weights = []

        # build_rule_list(buy_signals,sell_signals)
        assert len(buy_signals) == len(buy_signals_weights), "The number of buy signals and their weights must be the same."
        assert len(sell_signals) == len(sell_signals_weights), "The number of sell signals and their weights must be the same."
        close = get_measure_data("收盤價")
        ticker_list = list(close.columns)
        # ticker_list = ['1101','1102','1301','1326','1402','2101','2105','2106','2227','2258','2301']

        signal = buy_signals + sell_signals
        weights = buy_signals_weights + sell_signals_weights
        # ['B0','B1','B2','B3','B4','S0','S2','S1','S3','S4']

        # combinedata(ticker_list,signal,weights,user='Combine',long_short = ['Short'],strategy_list = ['strategy_1','strategy_2','strategy_3'])
        # combinedata_week(ticker_list,user='Combine')
        # combinedata_daily(ticker_list,user='Combine',strategy_list = ['strategy_1','strategy_2','strategy_3'])
        # combinedata_performance(ticker_list,user = 'Combine')
        # build_show_report('Result_Current_Combine').build()
        # build_show_report('Result_Back_Combine').build()
        my_file_path= os.path.join('Result','Result_Back_Combine.feather')
        target_url = 'https://docs.google.com/spreadsheets/d/1-06bHSt80vHliUVNScjW5nJu5H6QslpTh2UDg93bUWE/edit?gid=1497592500#gid=1497592500'
        target_sheetname='Data_Combine'
        Equity168.Upload2Gspread(my_file_path,target_url,target_sheetname, replace_values=False)

        my_file_path= os.path.join('Result','Result_Current_Combine.feather')
        target_url = 'https://docs.google.com/spreadsheets/d/1-06bHSt80vHliUVNScjW5nJu5H6QslpTh2UDg93bUWE/edit?gid=1497592500#gid=1497592500'
        target_sheetname='CurrentData_Combine'
        Equity168.Upload2Gspread(my_file_path,target_url,target_sheetname, replace_values=False)

        my_file_path= os.path.join('Result','Result_Performance_Table_Combine.feather')
        target_url = 'https://docs.google.com/spreadsheets/d/1-06bHSt80vHliUVNScjW5nJu5H6QslpTh2UDg93bUWE/edit?gid=1497592500#gid=1497592500'
        target_sheetname='Performance_Combine'
        Equity168.Upload2Gspread(my_file_path,target_url,target_sheetname, replace_values=False)

        my_file_path= os.path.join('Result','Result_Back_Daily_Trading_List_Combine.feather')
        target_url = 'https://docs.google.com/spreadsheets/d/1-06bHSt80vHliUVNScjW5nJu5H6QslpTh2UDg93bUWE/edit?gid=1497592500#gid=1497592500'
        target_sheetname='Trading_List'
        Equity168.Upload2Gspread(my_file_path,target_url,target_sheetname, replace_values=False)

        my_file_path= os.path.join('Result','Result_Current_Combine_Show.feather')
        target_url = 'https://docs.google.com/spreadsheets/d/1-06bHSt80vHliUVNScjW5nJu5H6QslpTh2UDg93bUWE/edit?gid=1497592500#gid=1497592500'
        target_sheetname='ReportShow'
        Equity168.Upload2Gspread(my_file_path,target_url,target_sheetname, replace_values=False)

        my_file_path= os.path.join('Result','Result_Back_Combine_Show.feather')
        target_url = 'https://docs.google.com/spreadsheets/d/1-06bHSt80vHliUVNScjW5nJu5H6QslpTh2UDg93bUWE/edit?gid=1497592500#gid=1497592500'
        target_sheetname='ReportShowHistory'
        Equity168.Upload2Gspread(my_file_path,target_url,target_sheetname, replace_values=False)

    if 1: # 合併的整理上傳資料
        print("---開始處理Quant---")

        buy_signals = ['S0','S1','S2','B5','S14','S15','S17','S18']

        sell_signals = []

        # buy_signals_weights = [-0.5,-1,0,-0.5,0,1,-1,-1,1,-1] # 相反 比較好
        buy_signals_weights = [-0.5,-1,-0.5,1,1,-1,-0.5,-0.5]

        sell_signals_weights = []

        # build_rule_list(buy_signals,sell_signals)
        assert len(buy_signals) == len(buy_signals_weights), "The number of buy signals and their weights must be the same."
        assert len(sell_signals) == len(sell_signals_weights), "The number of sell signals and their weights must be the same."
        close = get_measure_data("收盤價")
        ticker_list = list(close.columns)
        # ticker_list = ['1101','1102','1301','1326','1402','2101','2105','2106','2227','2258','2301']

        signal = buy_signals + sell_signals
        weights = buy_signals_weights + sell_signals_weights
        # ['B0','B1','B2','B3','B4','S0','S2','S1','S3','S4']

        combinedata(ticker_list,signal,weights,user='Quant2',long_short = ['Short'],strategy_list = ['strategy_1','strategy_2','strategy_3','strategy_4','strategy_5'])
        combinedata_week(ticker_list,user='Quant2')
        combinedata_daily(ticker_list,user='Quant2',strategy_list = ['strategy_1','strategy_2','strategy_3','strategy_4','strategy_5'])
        combinedata_performance(ticker_list,user = 'Quant2')
        build_show_report('Result_Current_Quant2').build()
        build_show_report('Result_Back_Quant2').build()

        my_file_path= os.path.join('Result','Result_Back_Quant2.feather')
        target_url = 'https://docs.google.com/spreadsheets/d/1blydowDrQQQgAp5MuVzaweOZiKi-LsaRomjPzI5_8sM/edit?gid=1100992185#gid=1100992185'
        target_sheetname='Data_Quant'
        Equity168.Upload2Gspread(my_file_path,target_url,target_sheetname, replace_values=False)

        my_file_path= os.path.join('Result','Result_Current_Quant2.feather')
        target_url = 'https://docs.google.com/spreadsheets/d/1blydowDrQQQgAp5MuVzaweOZiKi-LsaRomjPzI5_8sM/edit?gid=1100992185#gid=1100992185'
        target_sheetname='CurrentData_Quant'
        Equity168.Upload2Gspread(my_file_path,target_url,target_sheetname, replace_values=False)

        my_file_path= os.path.join('Result','Result_Performance_Table_Quant2.feather')
        target_url = 'https://docs.google.com/spreadsheets/d/1blydowDrQQQgAp5MuVzaweOZiKi-LsaRomjPzI5_8sM/edit?gid=1100992185#gid=1100992185'
        target_sheetname='Performance_Quant'
        Equity168.Upload2Gspread(my_file_path,target_url,target_sheetname, replace_values=False)

        my_file_path= os.path.join('Result','Result_Back_Daily_Trading_List_Quant2.feather')
        target_url = 'https://docs.google.com/spreadsheets/d/1blydowDrQQQgAp5MuVzaweOZiKi-LsaRomjPzI5_8sM/edit?gid=1100992185#gid=1100992185'
        target_sheetname='Trading_List'
        Equity168.Upload2Gspread(my_file_path,target_url,target_sheetname, replace_values=False)

        my_file_path= os.path.join('Result','Result_Current_Quant2_Show.feather')
        target_url = 'https://docs.google.com/spreadsheets/d/1blydowDrQQQgAp5MuVzaweOZiKi-LsaRomjPzI5_8sM/edit?gid=1100992185#gid=1100992185'
        target_sheetname='ReportShow'
        Equity168.Upload2Gspread(my_file_path,target_url,target_sheetname, replace_values=False)

        my_file_path= os.path.join('Result','Result_Back_Quant2_Show.feather')
        target_url = 'https://docs.google.com/spreadsheets/d/1blydowDrQQQgAp5MuVzaweOZiKi-LsaRomjPzI5_8sM/edit?gid=1100992185#gid=1100992185'
        target_sheetname='ReportShowHistory'
        Equity168.Upload2Gspread(my_file_path,target_url,target_sheetname, replace_values=False)


    if 0: # 移動檔案到備份資料夾
        move_csv_files(source_directory, destination_directory)