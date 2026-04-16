# -*- coding: utf-8 -*-
"""
Created on Sat Jul  6 14:40:10 2024

@author: Stephen
"""

import pandas as pd
import Equity168 # 自定義


def main():
    #
    # Step - 設定
    #
    my_seed_buy=[54, 83, 108, 109, 115]
    my_weight_buy=[1, 1, 1, 1, 1] # 合計10
    my_seed_sell=[40, 41, 94, 101, 107]
    my_weight_sell=[1, 1, 1, 1, 1] # 合計10
    columns_to_keep = ['Date', 'ticker','corpname', 'Close', 'sma_year',
                       'B54', 'B83', 'B108', 'B109', 'B115',
                       'S40', 'S41', 'S94', 'S101', 'S107',
                       'Signal','Signal_lag20w']
    #
    # Step - 取得Ticker資料
    #
    print('Start')
    try:
        all_stock = pd.read_csv('Setting_TickerList.csv')
        all_stock=all_stock.sort_values(by='市值_AVG_20D', ascending=False)
        # all_stock=all_stock.head(200) # for 測試用
        all_stock=all_stock.head(20) # for 測試用

    except Exception as e:
        print(f"Error reading TickerList CSV: {e}")
        return
    #
    # Step - 處理資料
    #
    df_back_all=[]
    df_single_all=[]
    df_single_columns=['Date','Ticker','CorpName','MarketValue','Score','Score_lag20w']
    # for my_ticker in all_stock['Ticker']:
    for my_ticker in [1313,1789,1904,3576,9904]:

        try:
            my_file_str = f'Data_Raw/pre_{my_ticker}-TW.csv'
            my_stock = Equity168.GetCSVData(my_file_str)
            # my_stock = Equity168.GetBearData(str(my_ticker))


            my_get_last_date=my_stock.latestdate

            df_back = Equity168.GetDfbackWithBS(my_stock.histprice,0,my_seed_buy,my_seed_sell)  # 0-原始價格, 1=還原權值
            df_back.reset_index(inplace=True)
            # Buy
            # Calculate Buy Signal
            df_back['Signal'] = sum(df_back[f'B{i}'] * w for i, w in zip(my_seed_buy, my_weight_buy))
            # Calculate Sell Signal
            df_back['Signal'] = df_back['Signal']+sum(df_back[f'S{i}'] * (-w) for i, w in zip(my_seed_sell, my_weight_sell))
            #
            df_back['Signal_lag20w']=df_back['Signal'].rolling(20).mean()
            #
            df_back_sorted = df_back.sort_values(by='Date', ascending=True).tail(2600)
            df_back_all.append(df_back_sorted)
            df_single=[my_get_last_date,my_ticker,df_back['corpname'].iloc[-1],my_stock.markval,df_back['Signal'].iloc[-1],df_back['Signal_lag20w'].iloc[-1]]
            df_single_all.append(df_single)
        except Exception as e:
            print(f"Error processing ticker {my_ticker}: {e}")
            continue
    # end for
    # Combine all dataframes into a single dataframe
    if df_single_all:
        df_single_all_df = pd.DataFrame(df_single_all, columns=df_single_columns)
        my_file_path='Data_Result_ISWRs/ISWRs_'+str(my_get_last_date)+'_current.csv'
        df_single_all_df.to_csv(my_file_path, index=False)
        # target_url='https://docs.google.com/spreadsheets/d/1pi8IW913dh5oTVtVfSxrWs3Fqmu9W6kkVg91PALJxq4/edit?gid=0#gid=0'
        target_url = 'https://docs.google.com/spreadsheets/d/1RlID2s6K89GcLc7MhKUm1qf0JLTY4rqysH9hVjxDVeM/edit?gid=1109596478#gid=1109596478'

        target_sheetname='CurrentData'
        Equity168.Upload2Gspread(my_file_path,target_url,target_sheetname, replace_values=False)
        print('1 OK')

    if df_back_all:
        combined_df_back = pd.concat(df_back_all, ignore_index=True)
        combined_df_back=combined_df_back[columns_to_keep]
        combined_df_back['Date'] = pd.to_datetime(combined_df_back['Date'], format='%Y-%m-%d')

        # 获取最新日期
        latest_date = combined_df_back['Date'].max()
        #print(latest_date)

        # 取每周的最后一天（假设星期五）的数据
        df_upload = combined_df_back[combined_df_back['Date'].dt.weekday == 4]
        #print(df_upload)

        # 保留指定列
        #df_upload = df_upload[columns_to_keep]

        # 获取最新日期的数据
        latest_data = combined_df_back[combined_df_back['Date'] == latest_date]
        #latest_data = latest_data[columns_to_keep]
        #latest_data['Date'] = pd.to_datetime(latest_data['Date'], format='%Y-%m-%d')
        #print(latest_data)

        # 重置索引以保留 'Date' 列
        #latest_data.reset_index(inplace=True)

        # 合并每周最后一天数据和最新日期数据，并删除重复项
        df_upload = pd.concat([df_upload, latest_data]).drop_duplicates().reset_index(drop=True)
        #print(df_upload)
        #
        #
        #
        my_file_path='Data_Result_ISWRs/ISWRs_'+str(my_get_last_date)+'.csv'
        df_upload.to_csv(my_file_path, index=False)
        # target_url='https://docs.google.com/spreadsheets/d/1pi8IW913dh5oTVtVfSxrWs3Fqmu9W6kkVg91PALJxq4/edit?gid=0#gid=0'
        target_url = 'https://docs.google.com/spreadsheets/d/1RlID2s6K89GcLc7MhKUm1qf0JLTY4rqysH9hVjxDVeM/edit?gid=1109596478#gid=1109596478'
        target_sheetname='Data'
        Equity168.Upload2Gspread(my_file_path,target_url,target_sheetname, replace_values=False)
        print('2 OK')
        # Display the first few rows of the filtered DataFrame for verification
        # print(df_upload.head())


if __name__ == '__main__':
    main()
