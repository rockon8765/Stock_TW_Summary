# -*- coding: utf-8 -*-
"""
自建Package, first try
v20240629
    [1] 將 if...else...架構 改成 字典架構
    [2] 配合[1]調成部分使用二個以上不等式的rule, 拆分成兩個以上的rule (影響於下方說明)
    [3] 對應下載資料新增集保之人數資訊, 相應增加rule

"""
show_reload_message = False # 在模組中添加安靜模式, 該全域變數用來控制是否顯示重新加載訊息。

import pandas as pd
import talib
from sqlalchemy import create_engine, text
import pygsheets
import numpy as np
import time

class Equity168_BearReturn:
    def __init__(self, histprice, markval, latestdate, datacount):
        self.histprice = histprice
        self.markval = markval
        self.latestdate=latestdate
        self.datacount=datacount


def GetCSVData(my_file_str):
    #
    #直接讀取已初步整理好的CSV檔案, 並設定好以Date為index, 傳回資料
    #
    try:
        #my_file_str='Data_Raw/'+str(my_ticker)+'-TW.csv'
        my_stock = pd.read_csv(my_file_str)

        if 'date' in my_stock.columns:
            my_stock = my_stock.rename(columns={"date": "Date"})

        if 'Date' in my_stock.columns:
            my_stock.set_index('Date', inplace=True)
            """
            inplace=True 是pandas中的一個參數，用於指示是否要在原始資料上直接進行修改，而不是返回一個修改後的副本。
            在你的例子中，my_stock.set_index('Date', inplace=True) 將會在 my_stock 這個 DataFrame 上直接修改索引，將索引設置為 'Date' 列的值。如果不使用 inplace=True，則該方法會返回修改後的 DataFrame，而不會修改原始的 my_stock DataFrame。
            這樣做的好處是可以在不創建額外的副本的情況下，直接在原始資料上進行索引的修改，節省記憶體和操作時間。
            """
        #my_stock.set_index('date', inplace=True) # 要加 inplace=True
        # 把日期變成Pandas的DateTime格式 # my_stock.index = pd.to_datetime(my_stock['date']) #不行
        my_stock.index = pd.to_datetime(my_stock.index)
        # 市值
        my_market_value=my_stock['總市值'].iloc[-1]
        my_get_last_date=my_stock.index[-1].strftime("%Y-%m-%d")
        my_get_count=my_stock['Ticker'].count()
        #
    except:
        print([my_file_str,'GetCSVData Error'])
        #my_get_count=0
        my_stock=0
        my_market_value=0
        my_get_last_date=0
        my_get_count=0

    return Equity168_BearReturn(histprice=my_stock, markval=my_market_value,latestdate=my_get_last_date,datacount=my_get_count)




def GetBearData(my_ticker,my_choice = None):  # 傳回 df_back
    #
    # Step 1 - Bear DB 下載資料
    # Step 2 - 決定試用原始價格或是還原權值價格
    # Step 3 - 並呼叫整理資料的程序 GetDfbackPreCalcu
    # Step 3 - 傳回資料
    #
    try:
        my_engine = create_engine("mysql+mysqlconnector://stephenwu:stephenwu@home.dottdot.com:13306/indistockdb_5") # if using "import mysql.connector"
        my_conn=my_engine.connect()
        # 要用這個text()來轉換SQL語句，才正常可用
        my_query = text('SELECT date,ticker,sector,corpname,開盤價,最高價,最低價,收盤價,開盤價_後復權,最高價_後復權,最低價_後復權,收盤價_後復權,成交量_股,成交金額,總市值,單月營收,累計營收,單月營收年成長率,單月營收月成長率,累計營收年成長率,日期_月營收_資料日,Flag_月營收,股價淨值比,本益比4,普通股股本,EPS4,ROE4_avg_5yr,ROE4_avg_10yr,現金股利_平均_5yr,現金股利_平均_10yr,Beta係數21D,Beta係數65D,Beta係數250D,日期_集保庫存_資料日,Flag_集保庫存,200張以上佔集保比率,400張以上佔集保比率,600張以上佔集保比率,800張以上佔集保比率,1000張以上佔集保比率,200張以上_人,400張以上_人,600張以上_人,800張以上_人,1000張以上_人,200張以上_張,400張以上_張,600張以上_張,800張以上_張,1000張以上_張,外資持股比率,投信持股比率 FROM indistockdb_5.'+my_ticker)
        #用Pandas讀取，直接存成 DataFrame 格式
        df_back = pd.read_sql(my_query, con=my_conn)
        df_back = df_back.rename(columns={"date": "Date"})
        df_back.set_index('Date', inplace=True)
        # Convert the index to Pandas DateTime format
        df_back.index = pd.to_datetime(df_back.index)
        # 市值
        my_market_value=df_back['總市值'].iloc[-1]
        # other
        my_get_last_date=df_back.index[-1].strftime("%Y-%m-%d")
        my_get_count=len(df_back)
        #df_back=GetDfbackPreCalcu(df_back,my_choice)
    except Exception as e:
        print([my_ticker, 'GetBearData Error', str(e)])
        df_back = 0
        my_market_value = 0
        my_get_last_date = 0
        my_get_count = 0
    finally:
        my_engine.dispose()

    return Equity168_BearReturn(histprice=df_back, markval=my_market_value, latestdate=my_get_last_date, datacount=my_get_count)


def GetDfbackPreCalcu(df_back,my_choice):
    #
    # Setting
    #
    my_set_ma_2w=10
    my_set_ma_short=20
    my_set_ma_middle=60
    my_set_ma_long=120
    my_set_ma_year=240
    my_set_shift=20
    #my_set_loc_BelowMax=20
    #my_set_buy_up=20
    #my_set_sell_down=20
    #stop_loss_multiplier = 2
    #take_profit_multiplier = 1.5
    # df_back => TA-Lib 格式
    #df_talib = df_back.rename(columns={"Open":"open","High": "high", "Low": "low","Close":"close"})
    if my_choice==0:
      df_back = df_back.rename(columns={"開盤價": "Open", "最高價": "High", "最低價": "Low", "收盤價": "Close", "成交量_股": "Volume"})
    elif my_choice==1:
      df_back = df_back.rename(columns={"開盤價_後復權": "Open", "最高價_後復權": "High", "最低價_後復權": "Low", "收盤價_後復權": "Close", "成交量_股": "Volume"})
    #
    df_back = df_back.sort_index()

    # MA
    df_back['Close_lag'] = df_back['Close'].shift(my_set_shift)
    df_back['sma_2w'] = df_back['Close'].rolling(my_set_ma_2w).mean()
    df_back['sma_2w_lag'] = df_back['sma_2w'].shift(my_set_shift)
    df_back['sma_short'] = df_back['Close'].rolling(my_set_ma_short).mean()
    df_back['sma_short_lag'] = df_back['sma_short'].shift(my_set_shift)
    df_back['sma_middle'] = df_back['Close'].rolling(my_set_ma_middle).mean()
    df_back['sma_middle_lag'] = df_back['sma_middle'].shift(my_set_shift)
    df_back['sma_long'] = df_back['Close'].rolling(my_set_ma_long).mean()
    df_back['sma_long_lag'] = df_back['sma_long'].shift(my_set_shift)
    df_back['sma_year'] = df_back['Close'].rolling(my_set_ma_year).mean()
    df_back['sma_year_lag'] = df_back['sma_year'].shift(my_set_shift)
    df_back['sma_delta_2w_year'] = df_back['sma_2w']-df_back['sma_year']
    df_back['sma_delta_short_year'] = df_back['sma_short']-df_back['sma_year']
    df_back['sma_delta_middle_year'] = df_back['sma_middle']-df_back['sma_year']
    df_back['sma_delta_2w_year_lag']=df_back['sma_delta_2w_year'].shift(my_set_shift)
    df_back['sma_delta_short_year_lag']=df_back['sma_delta_short_year'].shift(my_set_shift)
    df_back['sma_delta_middle_year_lag']=df_back['sma_delta_middle_year'].shift(my_set_shift)
    # 股價位置 - 目前收盤價在過去N日最高價與最低價的"相對位置"
    df_back['loc_BetweenMaxMin']=(df_back['Close']-df_back['Close'].rolling(200).min())/(df_back['Close'].rolling(200).max()-df_back['Close'].rolling(200).min())
    # 股價位置 - 區間上緣: 最近N个交易日最高价的最大值
    df_back['Period_High_short']=talib.MAX(df_back.High,timeperiod=my_set_ma_short).shift(1)
    df_back['Period_High_middle']=talib.MAX(df_back.High,timeperiod=my_set_ma_middle).shift(1)
    df_back['Period_High_long']=talib.MAX(df_back.High,timeperiod=my_set_ma_long).shift(1)
    # 股價位置 - 區間下緣: 最近N个交易日最低价的最小值
    df_back['Period_Low_short']=talib.MIN(df_back.Low,timeperiod=my_set_ma_short).shift(1)
    df_back['Period_Low_middle']=talib.MIN(df_back.Low,timeperiod=my_set_ma_middle).shift(1)
    df_back['Period_Low_long']=talib.MIN(df_back.Low,timeperiod=my_set_ma_long).shift(1)
    # 股價位置 - 近期高點回檔率: 從過去N天的最高點下跌了 XXX %, 可以做為移動停損利點的參考
    df_back['loc_BelowMax_short']=(df_back['Close']-df_back['Period_High_short'])/df_back['Period_High_short']
    df_back['loc_BelowMax_middle']=(df_back['Close']-df_back['Period_High_middle'])/df_back['Period_High_middle']
    df_back['loc_BelowMax_long']=(df_back['Close']-df_back['Period_High_long'])/df_back['Period_High_long']
    # PB百分位
    df_back['PB_Buy'] = df_back['股價淨值比'].rolling(1000).apply(lambda x: pd.Series(x).quantile(0.2))
    df_back['PB_Buy_5y15pct'] = df_back['股價淨值比'].rolling(1000).apply(lambda x: pd.Series(x).quantile(0.15))
    df_back['PB_Buy_5y10pct'] = df_back['股價淨值比'].rolling(1000).apply(lambda x: pd.Series(x).quantile(0.10))
    df_back['PB_Buy_10y20pct'] = df_back['股價淨值比'].rolling(2000).apply(lambda x: pd.Series(x).quantile(0.2))
    df_back['PB_Buy_10y15pct'] = df_back['股價淨值比'].rolling(2000).apply(lambda x: pd.Series(x).quantile(0.15))
    df_back['PB_Buy_10y10pct'] = df_back['股價淨值比'].rolling(2000).apply(lambda x: pd.Series(x).quantile(0.10))
    df_back['PB_Sell'] = df_back['股價淨值比'].rolling(1000).apply(lambda x: pd.Series(x).quantile(0.90))
    df_back['PB_Sell_5y90pct'] = df_back['股價淨值比'].rolling(1000).apply(lambda x: pd.Series(x).quantile(0.90))
    df_back['PB_Sell_5y85pct'] = df_back['股價淨值比'].rolling(1000).apply(lambda x: pd.Series(x).quantile(0.85))
    df_back['PB_Sell_10y90pct'] = df_back['股價淨值比'].rolling(2000).apply(lambda x: pd.Series(x).quantile(0.90))
    df_back['PB_Sell_10y85pct'] = df_back['股價淨值比'].rolling(2000).apply(lambda x: pd.Series(x).quantile(0.85))
    # PE
    df_back['PE_Buy_5y20pct'] = df_back['本益比4'].rolling(1000).apply(lambda x: pd.Series(x).quantile(0.20))
    df_back['PE_Buy_5y15pct'] = df_back['本益比4'].rolling(1000).apply(lambda x: pd.Series(x).quantile(0.15))
    df_back['PE_Buy_5y10pct'] = df_back['本益比4'].rolling(1000).apply(lambda x: pd.Series(x).quantile(0.10))
    # Beta
    df_back['Beta250_5y85pct'] = df_back['Beta係數250D'].rolling(1000).apply(lambda x: pd.Series(x).quantile(0.85))
    df_back['Beta250_5y90pct'] = df_back['Beta係數250D'].rolling(1000).apply(lambda x: pd.Series(x).quantile(0.90))
    df_back['Beta250_10y85pct'] = df_back['Beta係數250D'].rolling(2000).apply(lambda x: pd.Series(x).quantile(0.85))
    df_back['Beta250_10y90pct'] = df_back['Beta係數250D'].rolling(2000).apply(lambda x: pd.Series(x).quantile(0.90))
    df_back['Beta250_5y15pct'] = df_back['Beta係數250D'].rolling(1000).apply(lambda x: pd.Series(x).quantile(0.15))
    df_back['Beta250_5y10pct'] = df_back['Beta係數250D'].rolling(1000).apply(lambda x: pd.Series(x).quantile(0.10))
    df_back['Beta250_10y15pct'] = df_back['Beta係數250D'].rolling(2000).apply(lambda x: pd.Series(x).quantile(0.15))
    df_back['Beta250_10y10pct'] = df_back['Beta係數250D'].rolling(2000).apply(lambda x: pd.Series(x).quantile(0.10))
    # BB通道 - 計算布林通道的上軌、中線和下軌
    upper_band, middle_band, lower_band = talib.BBANDS(df_back['Close'], timeperiod=my_set_ma_short, nbdevup=2, nbdevdn=2)
    df_back['BB_upper_short'] = upper_band
    df_back['BB_middle_short'] = middle_band
    df_back['BB_lower_short'] = lower_band
    df_back['BB_width_short']= (upper_band-lower_band)/middle_band
    df_back['BB_width_short_lag']=df_back['BB_width_short'].shift(my_set_shift)
    upper_band, middle_band, lower_band = talib.BBANDS(df_back['Close'], timeperiod=my_set_ma_middle, nbdevup=2, nbdevdn=2)
    df_back['BB_upper_middle'] = upper_band
    df_back['BB_middle_middle'] = middle_band
    df_back['BB_lower_middle'] = lower_band
    df_back['BB_width_middle']= (upper_band-lower_band)/middle_band
    df_back['BB_width_middle_lag']=df_back['BB_width_middle'].shift(my_set_shift)
    upper_band, middle_band, lower_band = talib.BBANDS(df_back['Close'], timeperiod=my_set_ma_long, nbdevup=2, nbdevdn=2)
    df_back['BB_upper_long'] = upper_band
    df_back['BB_middle_long'] = middle_band
    df_back['BB_lower_long'] = lower_band
    df_back['BB_width_long']= (upper_band-lower_band)/middle_band
    df_back['BB_width_long_lag']=df_back['BB_width_long'].shift(my_set_shift)
    # KD
    df_back['slowk_9'], df_back['slowd_9'] = talib.STOCH(df_back['High'], df_back['Low'], df_back['Close'], fastk_period=9, slowk_period=3, slowd_period=3)
    df_back['slowk_short'], df_back['slowd_short'] = talib.STOCH(df_back['High'], df_back['Low'], df_back['Close'], fastk_period=my_set_ma_short, slowk_period=3, slowd_period=3)
    df_back['slowk_middle'], df_back['slowd_middle'] = talib.STOCH(df_back['High'], df_back['Low'], df_back['Close'], fastk_period=my_set_ma_middle, slowk_period=3, slowd_period=3)
    df_back['slowk_long'], df_back['slowd_long'] = talib.STOCH(df_back['High'], df_back['Low'], df_back['Close'], fastk_period=my_set_ma_long, slowk_period=3, slowd_period=3)
    # 現金股利率
    df_back['現金股利率5y']=df_back['現金股利_平均_5yr']/df_back['Close']
    df_back['現金股利率10y']=df_back['現金股利_平均_10yr']/df_back['Close']
    # 月營收
    df_back['月營收3Mavg'] = None
    for i in range(len(df_back)): # 遍歷每一行來計算最近三個 Flag_月營收 為1的 '單月營收' 平均數
        prev_indices = df_back.iloc[:i].index[df_back.iloc[:i]['Flag_月營收'] == 1].to_list()[-3:] # 找到之前三個 Flag_月營收 為1的索引
        if len(prev_indices) == 3:
            avg = df_back.loc[prev_indices, '單月營收'].mean() # 計算 '單月營收' 的平均數
            df_back.at[df_back.index[i-1], '月營收3Mavg'] = avg
    df_back['月營收12Mavg'] = None
    for i in range(len(df_back)): # 遍歷每一行來計算最近三個 Flag_月營收 為1的 '單月營收' 平均數
        prev_indices = df_back.iloc[:i].index[df_back.iloc[:i]['Flag_月營收'] == 1].to_list()[-12:] # 找到之前三個 Flag_月營收 為1的索引
        if len(prev_indices) == 12:
            avg = df_back.loc[prev_indices, '單月營收'].mean() # 計算 '單月營收' 的平均數
            df_back.at[df_back.index[i-1], '月營收12Mavg'] = avg
    # 400張以上佔集保比率
    df_back['400張以上佔集保比率_short'] = df_back['400張以上佔集保比率'].rolling(my_set_ma_short).mean()
    df_back['400張以上佔集保比率_middle'] = df_back['400張以上佔集保比率'].rolling(my_set_ma_middle).mean()
    df_back['400張以上佔集保比率_long'] = df_back['400張以上佔集保比率'].rolling(my_set_ma_long).mean()
    df_back['400張以上佔集保比率_year'] = df_back['400張以上佔集保比率'].rolling(my_set_ma_year).mean()
    # 1000張以上佔集保比率
    df_back['1000張以上佔集保比率_short'] = df_back['1000張以上佔集保比率'].rolling(my_set_ma_short).mean()
    df_back['1000張以上佔集保比率_middle'] = df_back['1000張以上佔集保比率'].rolling(my_set_ma_middle).mean()
    df_back['1000張以上佔集保比率_long'] = df_back['1000張以上佔集保比率'].rolling(my_set_ma_long).mean()
    df_back['1000張以上佔集保比率_year'] = df_back['1000張以上佔集保比率'].rolling(my_set_ma_year).mean()
    # 集保人數
    df_back['200張以上_人_short'] = df_back['200張以上_人'].rolling(my_set_ma_short).mean()
    df_back['200張以上_人_middle'] = df_back['200張以上_人'].rolling(my_set_ma_middle).mean()
    df_back['200張以上_人_long'] = df_back['200張以上_人'].rolling(my_set_ma_long).mean()
    df_back['200張以上_人_year'] = df_back['200張以上_人'].rolling(my_set_ma_year).mean()
    df_back['400張以上_人_short'] = df_back['400張以上_人'].rolling(my_set_ma_short).mean()
    df_back['400張以上_人_middle'] = df_back['400張以上_人'].rolling(my_set_ma_middle).mean()
    df_back['400張以上_人_long'] = df_back['400張以上_人'].rolling(my_set_ma_long).mean()
    df_back['400張以上_人_year'] = df_back['400張以上_人'].rolling(my_set_ma_year).mean()
    df_back['600張以上_人_short'] = df_back['600張以上_人'].rolling(my_set_ma_short).mean()
    df_back['600張以上_人_middle'] = df_back['600張以上_人'].rolling(my_set_ma_middle).mean()
    df_back['600張以上_人_long'] = df_back['600張以上_人'].rolling(my_set_ma_long).mean()
    df_back['600張以上_人_year'] = df_back['600張以上_人'].rolling(my_set_ma_year).mean()
    df_back['800張以上_人_short'] = df_back['800張以上_人'].rolling(my_set_ma_short).mean()
    df_back['800張以上_人_middle'] = df_back['800張以上_人'].rolling(my_set_ma_middle).mean()
    df_back['800張以上_人_long'] = df_back['800張以上_人'].rolling(my_set_ma_long).mean()
    df_back['800張以上_人_year'] = df_back['800張以上_人'].rolling(my_set_ma_year).mean()
    df_back['1000張以上_人_short'] = df_back['1000張以上_人'].rolling(my_set_ma_short).mean()
    df_back['1000張以上_人_middle'] = df_back['1000張以上_人'].rolling(my_set_ma_middle).mean()
    df_back['1000張以上_人_long'] = df_back['1000張以上_人'].rolling(my_set_ma_long).mean()
    df_back['1000張以上_人_year'] = df_back['1000張以上_人'].rolling(my_set_ma_year).mean()
    # 集保張數
    df_back['200張以上_張_short'] = df_back['200張以上_張'].rolling(my_set_ma_short).mean()
    df_back['200張以上_張_middle'] = df_back['200張以上_張'].rolling(my_set_ma_middle).mean()
    df_back['200張以上_張_long'] = df_back['200張以上_張'].rolling(my_set_ma_long).mean()
    df_back['200張以上_張_year'] = df_back['200張以上_張'].rolling(my_set_ma_year).mean()
    df_back['400張以上_張_short'] = df_back['400張以上_張'].rolling(my_set_ma_short).mean()
    df_back['400張以上_張_middle'] = df_back['400張以上_張'].rolling(my_set_ma_middle).mean()
    df_back['400張以上_張_long'] = df_back['400張以上_張'].rolling(my_set_ma_long).mean()
    df_back['400張以上_張_year'] = df_back['400張以上_張'].rolling(my_set_ma_year).mean()
    df_back['600張以上_張_short'] = df_back['600張以上_張'].rolling(my_set_ma_short).mean()
    df_back['600張以上_張_middle'] = df_back['600張以上_張'].rolling(my_set_ma_middle).mean()
    df_back['600張以上_張_long'] = df_back['600張以上_張'].rolling(my_set_ma_long).mean()
    df_back['600張以上_張_year'] = df_back['600張以上_張'].rolling(my_set_ma_year).mean()
    df_back['800張以上_張_short'] = df_back['800張以上_張'].rolling(my_set_ma_short).mean()
    df_back['800張以上_張_middle'] = df_back['800張以上_張'].rolling(my_set_ma_middle).mean()
    df_back['800張以上_張_long'] = df_back['800張以上_張'].rolling(my_set_ma_long).mean()
    df_back['800張以上_張_year'] = df_back['800張以上_張'].rolling(my_set_ma_year).mean()
    df_back['1000張以上_張_short'] = df_back['1000張以上_張'].rolling(my_set_ma_short).mean()
    df_back['1000張以上_張_middle'] = df_back['1000張以上_張'].rolling(my_set_ma_middle).mean()
    df_back['1000張以上_張_long'] = df_back['1000張以上_張'].rolling(my_set_ma_long).mean()
    df_back['1000張以上_張_year'] = df_back['1000張以上_張'].rolling(my_set_ma_year).mean()
    # 外資持股比例
    df_back['外資持股比率_short'] = df_back['外資持股比率'].rolling(my_set_ma_short).mean()
    df_back['外資持股比率_middle'] = df_back['外資持股比率'].rolling(my_set_ma_middle).mean()
    df_back['外資持股比率_long'] = df_back['外資持股比率'].rolling(my_set_ma_long).mean()
    df_back['外資持股比率_year'] = df_back['外資持股比率'].rolling(my_set_ma_year).mean()
    # 投信持股比率
    df_back['投信持股比率_short'] = df_back['投信持股比率'].rolling(my_set_ma_short).mean()
    df_back['投信持股比率_middle'] = df_back['投信持股比率'].rolling(my_set_ma_middle).mean()
    df_back['投信持股比率_long'] = df_back['投信持股比率'].rolling(my_set_ma_long).mean()
    df_back['投信持股比率_year'] = df_back['投信持股比率'].rolling(my_set_ma_year).mean()

    return df_back



def GetDfbackWithBS (df_back,my_choice,my_buy_set,my_sell_set):
  #
  # Step 1 - 將資料欄位轉換成
  # Step 2 - 產生組成買賣訊號的資料
  #

  df_back = df_back.sort_index()
  #
  # 產生 Buy Rule
  #
  """
  20240629
      原B22 : 改由 B22 & B84 組成
      原B23 : 改由 B23 & B85 組成
      原B24 : 改由 B24 & B86 組成
      原B25 : 改由 B25 & B87 組成
      原B83 : 改由 B35 & B83 組成
      原B30: 改由 B6 & B33 & B30 組成
      原B31: 改由 B6 & B34 & B31 組成
      原B32: 改由 B6 & B35 & B32 組成
      原42-47 : 改為由 B88 與 B42-B47 組成
      B52-B82 : 原'>=' 變更為 新'>'
      B83-87 : 配合B22-B35修訂, 新增
      B88-B107 : 新增
  """

  buy_rules = {
    0: ('B0', 'Close','>','sma_short'),
    1: ('B1', 'Close', '>', 'sma_middle'),
    2: ('B2', 'Close', '>', 'sma_long'),
    3: ('B3', 'Close', '>', 'sma_short_lag'),
    4: ('B4', 'Close', '>', 'sma_middle_lag'),
    5: ('B5', 'Close', '>', 'sma_long_lag'),
    6: ('B6', 'sma_short', '>', 'sma_short_lag'),
    7: ('B7', 'sma_middle', '>', 'sma_middle_lag'),
    8: ('B8', 'sma_long', '>', 'sma_long_lag'),
    9: ('B9', '股價淨值比', '<', 'PB_Buy'),
    10: ('B10', 'Close', '>', 'Period_High_short'),
    11: ('B11','Close','>','Period_High_middle'),
    12: ('B12','Close','>','Period_High_long'),
    13: ('B13','Close','>','BB_lower_short',),
    14: ('B14','Close','>','BB_lower_middle'),
    15: ('B15','Close','>','BB_lower_long'),
    16: ('B16','Close','>','BB_middle_short'),
    17: ('B17','Close','>','BB_middle_middle'),
    18: ('B18','Close','>','BB_middle_long'),
    19: ('B19','BB_width_short','>','BB_width_short_lag'),
    20: ('B20','BB_width_middle','>','BB_width_middle_lag'),
    21: ('B21','BB_width_long','>','BB_width_long_lag'),
    22: ('B22','slowk_9','<',20),
    23: ('B23','slowk_short','<',20),
    24: ('B24','slowk_middle','<',20),
    25: ('B25','slowk_long','<',20),
    26: ('B26','loc_BetweenMaxMin','<',0.3),
    27: ('B27','股價淨值比','<','PB_Buy_5y15pct'),
    28: ('B28','股價淨值比','<','PB_Buy_10y20pct'),
    29: ('B29','股價淨值比','<','PB_Buy_10y15pct'),
    30: ('B30','sma_short_lag','<','sma_long_lag'),
    31: ('B31','sma_short_lag','<','sma_middle_lag'),
    32: ('B32','sma_short_lag','<','sma_year_lag'),
    33: ('B33','sma_short','>','sma_long'),
    34: ('B34','sma_short','>','sma_middle'),
    35: ('B35','sma_short','>','sma_year'),
    36: ('B36','Beta係數250D','<','Beta250_5y15pct'),
    37: ('B37','Beta係數250D','<','Beta250_5y10pct'),
    38: ('B38','Beta係數250D','<','Beta250_10y15pct'),
    39: ('B39','Beta係數250D','<','Beta250_10y10pct'),
    40: ('B40','股價淨值比','<','PB_Buy_5y10pct'),
    41: ('B41','股價淨值比','<','PB_Buy_10y10pct'),
    42: ('B42','本益比4','<','PE_Buy_5y20pct'),
    43: ('B43','本益比4','<','PE_Buy_5y15pct'),
    44: ('B44','本益比4','<','PE_Buy_5y10pct'),
    45: ('B45','本益比4','<',10),
    46: ('B46','本益比4','<',15),
    47: ('B47','本益比4','<',20),
    48: ('B48','累計營收年成長率','>',0),
    49: ('B49','Beta係數250D','<',0.3),
    50: ('B50','現金股利率5y','>',0.06),
    51: ('B51','現金股利率10y','>',0.06),
    52: ('B52','ROE4_avg_5yr','>',0.1),
    53: ('B53','ROE4_avg_10yr','>',0.1),
    54: ('B54','月營收3Mavg','>','月營收12Mavg'),
    55: ('B55','400張以上佔集保比率','>','400張以上佔集保比率_short'),
    56: ('B56','400張以上佔集保比率','>','400張以上佔集保比率_middle'),
    57: ('B57','400張以上佔集保比率','>','400張以上佔集保比率_long'),
    58: ('B58','400張以上佔集保比率','>','400張以上佔集保比率_year'),
    59: ('B59','400張以上佔集保比率_short','>','400張以上佔集保比率_middle'),
    60: ('B60','400張以上佔集保比率_short','>','400張以上佔集保比率_long'),
    61: ('B61','400張以上佔集保比率_short','>','400張以上佔集保比率_year'),
    62: ('B62','1000張以上佔集保比率','>','1000張以上佔集保比率_short'),
    63: ('B63','1000張以上佔集保比率','>','1000張以上佔集保比率_middle'),
    64: ('B64','1000張以上佔集保比率','>','1000張以上佔集保比率_long'),
    65: ('B65','1000張以上佔集保比率','>','1000張以上佔集保比率_year'),
    66: ('B66','1000張以上佔集保比率_short','>','1000張以上佔集保比率_middle'),
    67: ('B67','1000張以上佔集保比率_short','>','1000張以上佔集保比率_long'),
    68: ('B68','1000張以上佔集保比率_short','>','1000張以上佔集保比率_year'),
    69: ('B69','外資持股比率','>','外資持股比率_short'),
    70: ('B70','外資持股比率','>','外資持股比率_middle'),
    71: ('B71','外資持股比率','>','外資持股比率_long'),
    72: ('B72','外資持股比率','>','外資持股比率_year'),
    73: ('B73','外資持股比率_short','>','外資持股比率_middle'),
    74: ('B74','外資持股比率_short','>','外資持股比率_long'),
    75: ('B75','外資持股比率_short','>','外資持股比率_year'),
    76: ('B76','投信持股比率','>','投信持股比率_short'),
    77: ('B77','投信持股比率','>','投信持股比率_middle'),
    78: ('B78','投信持股比率','>','投信持股比率_long'),
    79: ('B79','投信持股比率','>','投信持股比率_year'),
    80: ('B80','投信持股比率_short','>','投信持股比率_middle'),
    81: ('B81','投信持股比率_short','>','投信持股比率_long'),
    82: ('B82','投信持股比率_short','>','投信持股比率_year'),
    83: ('B83','sma_year','>','sma_year_lag'),
    84: ('B84','slowk_9','>','slowd_9'),
    85: ('B85','slowk_short','>','slowd_short'),
    86: ('B86','slowk_middle','>','slowd_middle'),
    87: ('B87','slowk_long','>','slowd_long'),
    88: ('B88','200張以上_人','>','200張以上_人_short'),
    89: ('B89','200張以上_人','>','200張以上_人_middle'),
    90: ('B90','200張以上_人','>','200張以上_人_long'),
    91: ('B91','200張以上_人','>','200張以上_人_year'),
    92: ('B92','400張以上_人','>','400張以上_人_short'),
    93: ('B93','400張以上_人','>','400張以上_人_middle'),
    94: ('B94','400張以上_人','>','400張以上_人_long'),
    95: ('B95','400張以上_人','>','400張以上_人_year'),
    96: ('B96','600張以上_人','>','600張以上_人_short'),
    97: ('B97','600張以上_人','>','600張以上_人_middle'),
    98: ('B98','600張以上_人','>','600張以上_人_long'),
    99: ('B99','600張以上_人','>','600張以上_人_year'),
    100: ('B100','800張以上_人','>','800張以上_人_short'),
    101: ('B101','800張以上_人','>','800張以上_人_middle'),
    102: ('B102','800張以上_人','>','800張以上_人_long'),
    103: ('B103','800張以上_人','>','800張以上_人_year'),
    104: ('B104','1000張以上_人','>','1000張以上_人_short'),
    105: ('B105','1000張以上_人','>','1000張以上_人_middle'),
    106: ('B106','1000張以上_人','>','1000張以上_人_long'),
    107: ('B107','1000張以上_人','>','1000張以上_人_year'),
    108: ('B108', 'Close', '>', 'sma_year'),
    109: ('B109','累計營收年成長率','>',0),
    110: ('B110','200張以上_張','>','200張以上_張_short'),
    111: ('B111','200張以上_張','>','200張以上_張_middle'),
    112: ('B112','200張以上_張','>','200張以上_張_long'),
    113: ('B113','200張以上_張','>','200張以上_張_year'),
    114: ('B114','400張以上_張','>','400張以上_張_short'),
    115: ('B115','400張以上_張','>','400張以上_張_middle'),
    116: ('B116','400張以上_張','>','400張以上_張_long'),
    117: ('B117','400張以上_張','>','400張以上_張_year'),
    118: ('B118','600張以上_張','>','600張以上_張_short'),
    119: ('B119','600張以上_張','>','600張以上_張_middle'),
    120: ('B120','600張以上_張','>','600張以上_張_long'),
    121: ('B121','600張以上_張','>','600張以上_張_year'),
    122: ('B122','800張以上_張','>','800張以上_張_short'),
    123: ('B123','800張以上_張','>','800張以上_張_middle'),
    124: ('B124','800張以上_張','>','800張以上_張_long'),
    125: ('B125','800張以上_張','>','800張以上_張_year'),
    126: ('B126','1000張以上_張','>','1000張以上_張_short'),
    127: ('B127','1000張以上_張','>','1000張以上_張_middle'),
    128: ('B128','1000張以上_張','>','1000張以上_張_long'),
    129: ('B129','1000張以上_張','>','1000張以上_張_year')
  }

  for my_buy_index in my_buy_set:
    if my_buy_index in buy_rules:
        col, col1, operator, col2 = buy_rules[my_buy_index]

        # Check if col1 is a valid column name in df_back or if it's a numerical value
        if isinstance(col1, str) and col1 in df_back.columns:
            val1 = df_back[col1]
        elif isinstance(col1, (int, float)):
            val1 = col1
        else:
            print(['buy_rules error - invalid col1', my_buy_index])
            continue

        # Check if col2_or_value is a valid column name in df_back or if it's a numerical value
        if isinstance(col2, str) and col2 in df_back.columns:
            val2 = df_back[col2]
        elif isinstance(col2, (int, float)):
            val2 = col2
        else:
            print(['buy_rules error - invalid col2', my_buy_index])
            continue

        # Perform comparison based on operator
        if operator == '>':
            df_back[col] = (val1 > val2).astype(int)
        elif operator == '<':
            df_back[col] = (val1 < val2).astype(int)
        # Add more conditions for other operators if needed

    else:
        print(['buy_rules error - rule not found', my_buy_index])
  #
  # 產生 Sell Rule
  #
  """
  20240629
      原S22 : 改由 S22 & S70 組成
      原S23 : 改由 S23 & S71 組成
      原S24 : 改由 S24 & S72 組成
      原S25 : 改由 S25 & S73 組成
      原S30: 改由 S6 & S33 & S30 組成
      原S31: 改由 S6 & S34 & S31 組成
      原S32: 改由 S6 & S35 & S32 組成
      原S40: 改由 S2 & S8 組成, S40為新定義
      原S70: 改由 S35 & S40 組成
      S74-S93 : 新增
  """

  sell_rules = {
    0: ('S0', 'Close','<','sma_short'),
    1: ('S1', 'Close', '<', 'sma_middle'),
    2: ('S2', 'Close', '<', 'sma_long'),
    3: ('S3', 'Close', '<', 'sma_short_lag'),
    4: ('S4', 'Close', '<', 'sma_middle_lag'),
    5: ('S5', 'Close', '<', 'sma_long_lag'),
    6: ('S6', 'sma_short', '<', 'sma_short_lag'),
    7: ('S7', 'sma_middle', '<', 'sma_middle_lag'),
    8: ('S8', 'sma_long', '<', 'sma_long_lag'),
    9: ('S9', '股價淨值比', '>', 'PB_Sell'),
    10: ('S10', 'Close', '<', 'Period_Low_short'),
    11: ('S11','Close','<','Period_Low_middle'),
    12: ('S12','Close','<','Period_Low_long'),
    13: ('S13','Close','<','BB_upper_short',),
    14: ('S14','Close','<','BB_upper_middle'),
    15: ('S15','Close','<','BB_upper_long'),
    16: ('S16','Close','<','BB_middle_short'),
    17: ('S17','Close','<','BB_middle_middle'),
    18: ('S18','Close','<','BB_middle_long'),
    19: ('S19','BB_width_short','<','BB_width_short_lag'),
    20: ('S20','BB_width_middle','<','BB_width_middle_lag'),
    21: ('S21','BB_width_long','<','BB_width_long_lag'),
    22: ('S22','slowk_9','>',80),
    23: ('S23','slowk_short','<',20),
    24: ('S24','slowk_middle','<',20),
    25: ('S25','slowk_long','<',20),
    26: ('S26','loc_BetweenMaxMin','>',0.9),
    27: ('S27','股價淨值比','>','PB_Sell_5y85pct'),
    28: ('S28','股價淨值比','>','PB_Sell_10y90pct'),
    29: ('S29','股價淨值比','>','PB_Sell_10y85pct'),
    30: ('S30','sma_short_lag','>','sma_long_lag'),
    31: ('S31','sma_short_lag','>','sma_middle_lag'),
    32: ('S32','sma_short_lag','>','sma_year_lag'),
    33: ('S33','sma_short','<','sma_long'),
    34: ('S34','sma_short','<','sma_middle'),
    35: ('S35','sma_short','<','sma_year'),
    36: ('S36','Beta係數250D','>','Beta250_5y85pct'),
    37: ('S37','Beta係數250D','>','Beta250_5y90pct'),
    38: ('S38','Beta係數250D','>','Beta250_10y85pct'),
    39: ('S39','Beta係數250D','>','Beta250_10y90pct'),
    40: ('S40','sma_year','<','sma_year_lag'),
    41: ('S41','月營收3Mavg','<','月營收12Mavg'),
    42: ('S42','400張以上佔集保比率','<','400張以上佔集保比率_short'),
    43: ('S43','400張以上佔集保比率','<','400張以上佔集保比率_middle'),
    44: ('S44','400張以上佔集保比率','<','400張以上佔集保比率_long'),
    45: ('S45','400張以上佔集保比率','<','400張以上佔集保比率_year'),
    46: ('S46','400張以上佔集保比率_short','<','400張以上佔集保比率_middle'),
    47: ('S47','400張以上佔集保比率_short','<','400張以上佔集保比率_long'),
    48: ('S48','400張以上佔集保比率_short','<','400張以上佔集保比率_year'),
    49: ('S49','1000張以上佔集保比率','<','1000張以上佔集保比率_short'),
    50: ('S50','1000張以上佔集保比率','<','1000張以上佔集保比率_middle'),
    51: ('S51','1000張以上佔集保比率','<','1000張以上佔集保比率_long'),
    52: ('S52','1000張以上佔集保比率','<','1000張以上佔集保比率_year'),
    53: ('S53','1000張以上佔集保比率_short','<','1000張以上佔集保比率_middle'),
    54: ('S54','1000張以上佔集保比率_short','<','1000張以上佔集保比率_long'),
    55: ('S55','1000張以上佔集保比率_short','<','1000張以上佔集保比率_year'),
    56: ('S56','外資持股比率','<','外資持股比率_short'),
    57: ('S57','外資持股比率','<','外資持股比率_middle'),
    58: ('S58','外資持股比率','<','外資持股比率_long'),
    59: ('S59','外資持股比率','<','外資持股比率_year'),
    60: ('S60','外資持股比率_short','<','外資持股比率_middle'),
    61: ('S61','外資持股比率_short','<','外資持股比率_long'),
    62: ('S62','外資持股比率_short','<','外資持股比率_year'),
    63: ('S63','投信持股比率','<','投信持股比率_short'),
    64: ('S64','投信持股比率','<','投信持股比率_middle'),
    65: ('S65','投信持股比率','<','投信持股比率_long'),
    66: ('S66','投信持股比率','<','投信持股比率_year'),
    67: ('S67','投信持股比率_short','<','投信持股比率_middle'),
    68: ('S68','投信持股比率_short','<','投信持股比率_long'),
    69: ('S69','投信持股比率_short','<','投信持股比率_year'),
    70: ('S70','slowk_9','<','slowd_9'),
    71: ('S71','slowk_short','<','slowd_short'),
    72: ('S72','slowk_middle','<','slowd_middle'),
    73: ('S73','slowk_long','<','slowd_long'),
    74: ('S74','200張以上_人','<','200張以上_人_short'),
    75: ('S75','200張以上_人','<','200張以上_人_middle'),
    76: ('S76','200張以上_人','<','200張以上_人_long'),
    77: ('S77','200張以上_人','<','200張以上_人_year'),
    78: ('S78','400張以上_人','<','400張以上_人_short'),
    79: ('S79','400張以上_人','<','400張以上_人_middle'),
    80: ('S80','400張以上_人','<','400張以上_人_long'),
    81: ('S81','400張以上_人','<','400張以上_人_year'),
    82: ('S82','600張以上_人','<','600張以上_人_short'),
    83: ('S83','600張以上_人','<','600張以上_人_middle'),
    84: ('S84','600張以上_人','<','600張以上_人_long'),
    85: ('S85','600張以上_人','<','600張以上_人_year'),
    86: ('S86','800張以上_人','<','800張以上_人_short'),
    87: ('S87','800張以上_人','<','800張以上_人_middle'),
    88: ('S88','800張以上_人','<','800張以上_人_long'),
    89: ('S89','800張以上_人','<','800張以上_人_year'),
    90: ('S90','1000張以上_人','<','1000張以上_人_short'),
    91: ('S91','1000張以上_人','<','1000張以上_人_middle'),
    92: ('S92','1000張以上_人','<','1000張以上_人_long'),
    93: ('S93','1000張以上_人','<','1000張以上_人_year'),
    94: ('S94', 'Close', '<', 'sma_year'),
    95: ('S95', 'sma_delta_2w_year', '<', 'sma_delta_2w_year_lag'),
    96: ('S96', 'sma_delta_short_year', '<', 'sma_delta_short_year_lag'),
    97: ('S97', 'sma_delta_middle_year', '<', 'sma_delta_middle_year_lag'),
    98: ('S98', 'loc_BelowMax_short','<',-0.1),
    99: ('S99', 'loc_BelowMax_middle','<',-0.1),
    100: ('S100', 'loc_BelowMax_long','<',-0.1),
    101: ('S101','累計營收年成長率','<',0),
    102: ('S102','200張以上_張','<','200張以上_張_short'),
    103: ('S103','200張以上_張','<','200張以上_張_middle'),
    104: ('S104','200張以上_張','<','200張以上_張_long'),
    105: ('S105','200張以上_張','<','200張以上_張_year'),
    106: ('S106','400張以上_張','<','400張以上_張_short'),
    107: ('S107','400張以上_張','<','400張以上_張_middle'),
    108: ('S108','400張以上_張','<','400張以上_張_long'),
    109: ('S109','400張以上_張','<','400張以上_張_year'),
    110: ('S110','600張以上_張','<','600張以上_張_short'),
    111: ('S111','600張以上_張','<','600張以上_張_middle'),
    112: ('S112','600張以上_張','<','600張以上_張_long'),
    113: ('S113','600張以上_張','<','600張以上_張_year'),
    114: ('S114','800張以上_張','<','800張以上_張_short'),
    115: ('S115','800張以上_張','<','800張以上_張_middle'),
    116: ('S116','800張以上_張','<','800張以上_張_long'),
    117: ('S117','800張以上_張','<','800張以上_張_year'),
    118: ('S118','1000張以上_張','<','1000張以上_張_short'),
    119: ('S119','1000張以上_張','<','1000張以上_張_middle'),
    120: ('S120','1000張以上_張','<','1000張以上_張_long'),
    121: ('S121','1000張以上_張','<','1000張以上_張_year')
  }

  for my_sell_index in my_sell_set:
    if my_sell_index in sell_rules:
        col, col1, operator, col2 = sell_rules[my_sell_index]

        # Check if col1 is a valid column name in df_back or if it's a numerical value
        if isinstance(col1, str) and col1 in df_back.columns:
            val1 = df_back[col1]
        elif isinstance(col1, (int, float)):
            val1 = col1
        else:
            print(['sell_rules error - invalid col1', my_sell_index])
            continue

        # Check if col2_or_value is a valid column name in df_back or if it's a numerical value
        if isinstance(col2, str) and col2 in df_back.columns:
            val2 = df_back[col2]
        elif isinstance(col2, (int, float)):
            val2 = col2
        else:
            print(['sell_rules error - invalid col2', my_sell_index])
            continue

        # Perform comparison based on operator
        if operator == '>':
            df_back[col] = (val1 > val2).astype(int)
        elif operator == '<':
            df_back[col] = (val1 < val2).astype(int)
        # Add more conditions for other operators if needed

    else:
        print(['sell_rules error - rule not found', my_sell_index])

  return df_back
import pandas as pd
import numpy as np
import pygsheets
import time

def Upload2Gspread(data_path_str, target_url, target_sheetname, replace_values=True):
    try:
        gc = pygsheets.authorize(service_account_file='myKey.json')
        output_wb = gc.open_by_url(target_url)
        output_sheet = output_wb.worksheet_by_title(target_sheetname)
        upload_data = pd.read_feather(data_path_str)

        upload_data.fillna(0, inplace=True)

        if replace_values:
            upload_data.replace([np.inf, -np.inf], -1, inplace=True)
            upload_data.replace(np.nan, -1, inplace=True)

        num_rows, num_cols = upload_data.shape

        # 自動擴展試算表行和列
        if output_sheet.rows < num_rows:
            output_sheet.add_rows(num_rows - output_sheet.rows)
        if output_sheet.cols < num_cols:
            output_sheet.add_cols(num_cols - output_sheet.cols)

        output_sheet.clear()

        # 分段上傳資料
        max_rows = 10000
        start_row = 0
        include_header = True  # 只有第一批包含標頭

        while start_row < len(upload_data):
            end_row = min(start_row + max_rows, len(upload_data))
            upload_chunk = upload_data.iloc[start_row:end_row].copy()

            # # 如果不是第一批次，移除標頭
            if not include_header:
                upload_chunk.columns = [''] * len(upload_chunk.columns)

            success = False
            retries = 5
            backoff = 1

            while not success and retries > 0:
                try:
                    if include_header:
                        output_sheet.set_dataframe(upload_chunk, (start_row + 1, 1), include_index=False, nan='')
                        include_header = False  # Only include header in the first batch
                    else:
                        output_sheet.set_dataframe(upload_chunk, (start_row + 1, 1), include_index=False, nan='', copy_head=False)
                    success = True
                except Exception as e:
                    print(f"Error uploading chunk starting at row {start_row}: {e}")
                    time.sleep(backoff)
                    backoff *= 2
                    retries -= 1

            if not success:
                raise Exception(f"Failed to upload chunk starting at row {start_row} after multiple retries.")

            start_row = end_row  # 更新行起點
            time.sleep(1)

        print("Upload completed successfully.")
        return 0
    except Exception as e:
        print(f"Error in Upload2Gspread: {e}")
        return -1

def Upload2Gspread_pres(data_path_str, target_url, target_sheetname, replace_values=True):
    try:
        gc = pygsheets.authorize(service_account_file='myKey.json')
        output_wb = gc.open_by_url(target_url)
        output_sheet = output_wb.worksheet_by_title(target_sheetname)
        upload_data = pd.read_feather(data_path_str)
        if 0:
            print("空值检查：")
            print(upload_data.isnull().sum())
        upload_data.fillna(0, inplace=True)

        if 0: # 找出空值
            corpname_null_tickers = upload_data[upload_data['CorpName'].isnull()]

            # 输出这些记录的ticker列
            print("CorpName为空值的ticker：")
            print(corpname_null_tickers[['Ticker', 'CorpName']])


        if replace_values:
            upload_data.replace([np.inf, -np.inf], -1, inplace=True)
            upload_data.replace(np.nan, -1, inplace=True)

        # 確定數據行和列的數量
        num_rows, num_cols = upload_data.shape

        # 自動擴展試算表行和列
        if output_sheet.rows < num_rows:
            output_sheet.add_rows(num_rows - output_sheet.rows)
        if output_sheet.cols < num_cols:
            output_sheet.add_cols(num_cols - output_sheet.cols)

        output_sheet.clear()

        # 分段上傳資料
        max_rows = 10000
        start_row = 0
        include_header = True
        while start_row < len(upload_data):
            end_row = min(start_row + max_rows, len(upload_data))
            if include_header:
                upload_chunk = upload_data.iloc[start_row:end_row].copy()
            else:
                upload_chunk = upload_data.iloc[start_row:end_row].copy()
                upload_chunk.columns = [''] * len(upload_chunk.columns)  # Remove the header

            # 如果不是第一批次，移除標頭
            if not include_header:
                upload_chunk.columns = [''] * len(upload_chunk.columns)

            success = False
            retries = 5
            backoff = 1

            while not success and retries > 0:
                try:
                    output_sheet.set_dataframe(upload_chunk, (start_row + 1, 1), include_index=False, nan='')  # 精確行起點
                    success = True
                    if include_header:
                        include_header = False  # 僅第一批次包含標頭
                except Exception as e:
                    print(f"Error uploading chunk starting at row {start_row}: {e}")
                    time.sleep(backoff)
                    backoff *= 2
                    retries -= 1

            if not success:
                raise Exception(f"Failed to upload chunk starting at row {start_row} after multiple retries.")

            start_row = end_row
            time.sleep(1)
            # include_header = False
        print("Upload completed successfully.")
        return 0
    except Exception as e:
        print(f"Error in Upload2Gspread: {e}")
        return -1

def Upload2Gspread_old(data_path_str,target_url,target_sheetname, replace_values=True):
    pass
    try:
        gc = pygsheets.authorize(service_account_file='myKey.json')
        output_wb = gc.open_by_url(target_url)
        output_sheet=output_wb.worksheet_by_title(target_sheetname)
        upload_data=pd.read_csv(data_path_str)
        if replace_values:
            upload_data.replace([np.inf, -np.inf], -1, inplace=True)
            upload_data.replace(np.nan, -1, inplace=True)
        output_sheet.clear()
        output_sheet.set_dataframe(upload_data,(0,0))
        return 0
    except Exception as e:
        print(f"Error in Upload2Gspread: {e}")
        return 1
