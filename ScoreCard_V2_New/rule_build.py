import os
import pandas as pd
import Equity168 # 自定義
import numpy as np
def get_rule_dictionary():
    buy_rules = {
    0: ('B0', '累計營收YOY由負轉正'),
    1: ('B1', '累積營收YoY比前一年的累積營收YoY高(連續三個月)'), # 累積營收YoY連續三個月高於去年同期
    2: ('B2', '單季營業利益YoY連兩季成長'),
    3: ('B3', '股票站上年線且比大盤強'),
    4: ('B4', '股票站上半年線且比大盤強'),
    5: ('B5', '股價自過去一年低點漲50%'),
    6: ('B6', '投信連續買超5日'),
    7: ('B7', '借券連續賣超5日'),
    8: ('B8', '千張大戶連續減碼五週'),
    9: ('B9', '當沖比率大於50%'),

    }

    sell_rules = {
    0: ('S0', '累計營收YoY由正轉負'),
    1: ('S1', '累積營收YoY比前一年的累積營收YoY低(連續三個月)'),# 累積營收YoY連續三個月低於去年同期
    2: ('S2', '單季營業利益YoY連兩季衰退'),
    3: ('S3', '股票跌破年線且比大盤弱'),
    4: ('S4', '股票跌破半年線且比大盤弱'),
    5: ('S5', '股價自過去一年高點跌50%'),
    6: ('S6', '投信連5日賣超'),
    7: ('S7', '借券連續5日無進出'),
    8: ('S8', '千張大戶連續加碼五週'),
    9: ('S9', '當沖比率小於50%'),
    10:('S10','累積營收連續三個月YOY衰退10%'),
    11:('S11','連續兩季單季稅後淨利YOY衰退5%'),
    12:('S12','連續兩季單季營業利益YOY衰退5%'),
    13:('S13','今年以來稅後獲利衰退YOY達10%'),
    14: ('S14', '股票跌破年線且比大盤弱5%'),
    15: ('S15', '股票跌破半年線且比大盤弱5%'),
    16: ('S16', 'PB百分位小於20%'),
    17: ('S17', 'PB百分位大於80%'),
    18: ('S18', '累計EPS的YoY小於-10%'),
    19: ('S19', '單季營業利益連續兩季衰退'),
    20: ('S20', '單季營收連兩季衰退'),
    21: ('S21', '單季營收YOY衰退達10%'),
    22: ('S22', '股票跌破年線且比大盤弱10%'),
    }


    return buy_rules, sell_rules

def align_dataframes(*dfs, join_type='inner'):
    """
    對任意數量的 DataFrame 進行index和column的對齊。
    """
    if not dfs:
        return []

    aligned_dfs = dfs[0]
    for df in dfs[1:]:
        aligned_dfs, df = aligned_dfs.align(df, join=join_type, axis=0)
        aligned_dfs, df = aligned_dfs.align(df, join=join_type, axis=1)
        aligned_dfs = aligned_dfs.combine_first(df)

    return [df.align(aligned_dfs, join=join_type, axis=0)[0].align(aligned_dfs, join=join_type, axis=1)[0] for df in dfs]

# 定義函數來根據季度調整月份偏移
def adjust_date(index):
    ''' 季報 '''
    new_dates = []
    for date in index:
        year_quarter = date.strftime('%Y%m')
        quarter = int(year_quarter[4:])
        if quarter == 1:
            new_date = date + pd.DateOffset(months=4)
        elif quarter == 2:
            new_date = date + pd.DateOffset(months=6)
        elif quarter == 3:
            new_date = date + pd.DateOffset(months=8)
        elif quarter == 4:
            new_date = date + pd.DateOffset(months=11)
        new_dates.append(new_date)
    return new_dates

def build_rule_list(use_buy_rules, use_sell_rules):
    buy_rules, sell_rules = get_rule_dictionary()

    close = get_measure_data("收盤價")
    start_date = pd.to_datetime(close.index.min(), format='%Y%m%d').strftime('%Y%m%d')
    end_date = pd.to_datetime(close.index.max(), format='%Y%m%d').strftime('%Y%m%d')
    all_days = pd.date_range(start=start_date, end=end_date, freq='D').strftime('%Y%m%d')

    for rules in use_buy_rules + use_sell_rules:
        result = bulid_rule_data(rules)
        if isinstance(result, pd.DataFrame):
            result.index = result.index.astype(str)
            result = result.reindex(close.index.astype(str)).ffill(axis=0)
            result.to_feather(os.path.join('Data_Rule', f"{rules}.feather"))
        else:
            print(f"Rule {rules} is not a DataFrame.")


def get_measure_data(measure_name):
    rule_data_path = os.path.join('CMoney_Measure')
    df = pd.read_feather(os.path.join(rule_data_path,"df_" + measure_name + ".feather"))
    df = df.set_index(df.columns[0])
    return df

def bulid_rule_data(rule):

    if rule == "B0":
        # 累計營收YOY由負轉正
        df = get_measure_data("累計合併營收成長(%)")
        result = (((df>0) * (df.shift(1)<0)) )*1
        result.index = pd.to_datetime(result.index.astype(str) + '01', format='%Y%m%d')
        result.index = result.index + pd.DateOffset(months=1)
        result.index = result.index.strftime('%Y%m') + '15'
        result.index = pd.to_datetime(result.index, format='%Y%m%d')
        result.index = result.index.strftime('%Y%m%d')
        return result

    elif rule == "B1":
        # 累積營收YoY比前一年的累積營收YoY高(連續三個月)
        df = get_measure_data("累計合併營收成長(%)")
        result =  ((df > df.shift(12)) * (df.shift(1) > df.shift(13)) * (df.shift(2) > df.shift(14)))*1
        result.index = pd.to_datetime(result.index.astype(str) + '01', format='%Y%m%d')
        result.index = result.index + pd.DateOffset(months=1)
        result.index = result.index.strftime('%Y%m') + '15'
        result.index = pd.to_datetime(result.index, format='%Y%m%d')
        result.index = result.index.strftime('%Y%m%d')
        return result
    elif rule == "B2":
        # 單季營業利益YoY連兩季成長
        df = get_measure_data("營業利益率(%)")
        result =  ((df > df.shift(4)) * (df.shift(1) > df.shift(5)) )*1
        result.index = pd.to_datetime(result.index.astype(str) + '01', format='%Y%m%d')
        result.index = adjust_date(result.index)
        result.index = result.index.strftime('%Y%m') + '15'
        result.index = pd.to_datetime(result.index, format='%Y%m%d')
        result.index = result.index.strftime('%Y%m%d')
        return result

    elif rule == "B3":
        # 股票站上年線且比大盤弱
        df1, df2, df3 = align_dataframes(get_measure_data("收盤價"),get_measure_data("年線"),get_measure_data("與大盤比年報酬率(%)"))
        return ((df1 > df2) * (df3 > 0)).fillna(0) * 1

    elif rule == "B4":
        # 股票站上半年線且比大盤弱
        df1, df2, df3 = align_dataframes(get_measure_data("收盤價"),get_measure_data("半年線"),get_measure_data("與大盤比半年報酬率(%)"))
        return ((df1 > df2) * (df3 > 0)).fillna(0) * 1

    elif rule == "B5":
        # 股價自過去一年低點漲50%
        df = get_measure_data("收盤價")
        df_min = df.rolling(252).min()
        result = ((df / df_min) > 1.5).fillna(0) * 1
        assert df.shape == result.shape , "Shape of df and result must be the same" # 檢查 df 和 result 的形狀是否相同
        return result

    elif rule == "B6":
        # 投信連續買超5日
        df = get_measure_data("投信連N日買超")
        result = (df >= 5).fillna(0) * 1
        return result

    elif rule == "B7":
        # 借券連續賣超5日
        df = get_measure_data("借券賣出")
        df_mask = (df > 0).fillna(0)
        result = (df_mask.rolling(5).sum() == 5).fillna(0) * 1
        assert df.shape == result.shape , "Shape of df and result must be the same" # 檢查 df 和 result 的形狀是否相同
        return result

    elif rule == "B8":
        # 千張大戶連續減碼五週
        df = get_measure_data("近1週1000張以上集保比率變動(%)")
        df_mask = (df < 0).fillna(0)
        result = (df_mask.rolling(5).sum() == 5).fillna(0) * 1
        assert df.shape == result.shape , "Shape of df and result must be the same" # 檢查 df 和 result 的形狀是否相同
        return result

    elif rule == "B9":
        # 當沖比率大於50
        df = get_measure_data("當沖成交量")
        df1 = get_measure_data("非當沖成交量")

        result = (df / (df + df1) > 0.5).fillna(0) * 1
        return result

    elif rule == "S0":
        # 累計營收YoY由正轉負
        df = get_measure_data("累計合併營收成長(%)")
        result = (((df<0) * (df.shift(1)>0)) > 0 )*1
        result.index = pd.to_datetime(result.index.astype(str) + '01', format='%Y%m%d')
        result.index = result.index + pd.DateOffset(months=1)
        result.index = result.index.strftime('%Y%m') + '15'
        result.index = pd.to_datetime(result.index, format='%Y%m%d')
        result.index = result.index.strftime('%Y%m%d')

        return result

    elif rule == "S1":
        # 累積營收YoY比前一年的累積營收YoY低(連續三個月)
        df = get_measure_data("累計合併營收成長(%)")
        result = ((df < df.shift(12)) * (df.shift(1) < df.shift(13)) * (df.shift(2) < df.shift(14)))*1
        result.index = pd.to_datetime(result.index.astype(str) + '01', format='%Y%m%d')
        result.index = result.index + pd.DateOffset(months=1)
        result.index = result.index.strftime('%Y%m') + '15'
        result.index = pd.to_datetime(result.index, format='%Y%m%d')
        result.index = result.index.strftime('%Y%m%d')

        return result

    elif rule == "S2":
        # 單季營業利益YoY連兩季成長
        df = get_measure_data("營業利益率(%)")
        result =  ((df < df.shift(4)) * (df.shift(1) < df.shift(5)) )*1
        result.index = pd.to_datetime(result.index.astype(str) + '01', format='%Y%m%d')
        result.index = adjust_date(result.index)
        result.index = result.index.strftime('%Y%m') + '15'
        result.index = pd.to_datetime(result.index, format='%Y%m%d')
        result.index = result.index.strftime('%Y%m%d')

        return result
    elif rule == "S3":
        # 股票跌破年線且比大盤弱
        df1, df2, df3 = align_dataframes(get_measure_data("收盤價"),get_measure_data("年線"),get_measure_data("與大盤比年報酬率(%)"))
        return ((df1 < df2) * (df3 < 0)).fillna(0) * 1

    elif rule == "S4":
        # 股票跌破半年線且比大盤弱
        df1, df2, df3 = align_dataframes(get_measure_data("收盤價"),get_measure_data("半年線"),get_measure_data("與大盤比半年報酬率(%)"))
        return ((df1 < df2) * (df3 < 0)).fillna(0) * 1

    elif rule == "S5":
        # 股價自過去一年高點跌50%
        df = get_measure_data("收盤價")
        df_max = df.rolling(252).max()
        result = ((df / df_max) > 1.5).fillna(0) * 1
        assert df.shape == result.shape , "Shape of df and result must be the same" # 檢查 df 和 result 的形狀是否相同
        return result

    elif rule == "S6":
        # 投信連5日賣超
        df = get_measure_data("投信連N日買超")
        result = (df <= 5).fillna(0) * 1
        return result

    elif rule == "S7":
        # 借券連續5日無進出
        df = get_measure_data("借券賣出")
        df_mask = (df == 0).fillna(0)
        result = (df_mask.rolling(5).sum() == 5).fillna(0) * 1
        assert df.shape == result.shape , "Shape of df and result must be the same" # 檢查 df 和 result 的形狀是否相同
        return result


    elif rule == "S8":
        # 千張大戶連續加碼五週
        df = get_measure_data("近1週1000張以上集保比率變動(%)")
        df_mask = (df > 0).fillna(0)
        result = (df_mask.rolling(5).sum() == 5).fillna(0) * 1
        assert df.shape == result.shape , "Shape of df and result must be the same" # 檢查 df 和 result 的形狀是否相同
        return result


    elif rule == "S9":
        # 當沖比率小於50%
        # 當沖比率大於50
        df = get_measure_data("當沖成交量")
        df1 = get_measure_data("非當沖成交量")

        result = (df / (df + df1) < 0.5).fillna(0) * 1
        return result

    elif rule == "S10":
        # 累積營收連續三個月衰退10%
        df = get_measure_data("累計合併營收成長(%)")
        result = ((df < -10) * ( df.shift(1) < -10) * ( df.shift(2) < -10) )*1
        result.index = pd.to_datetime(result.index.astype(str) + '01', format='%Y%m%d')
        result.index = result.index + pd.DateOffset(months=1)
        result.index = result.index.strftime('%Y%m') + '15'
        result.index = pd.to_datetime(result.index, format='%Y%m%d')
        result.index = result.index.strftime('%Y%m%d')

        return result

    elif rule == "S11":
        # 連續兩季單季稅後淨利YOY衰退5%
        df = get_measure_data("稅後純益成長率(%)")
        result =  ((df < -5) * ( df.shift(1) < -5) )*1
        result.index = pd.to_datetime(result.index.astype(str) + '01', format='%Y%m%d')
        result.index = adjust_date(result.index)
        result.index = result.index.strftime('%Y%m') + '15'
        result.index = pd.to_datetime(result.index, format='%Y%m%d')
        result.index = result.index.strftime('%Y%m%d')
        return result


    elif rule == "S12":
        # 連續兩季單季營業利益YOY衰退5%
        df = get_measure_data("營業利益率(%)")
        result =  ((df < -5) * ( df.shift(1) < -5) )*1
        result.index = pd.to_datetime(result.index.astype(str) + '01', format='%Y%m%d')
        result.index = adjust_date(result.index)
        result.index = result.index.strftime('%Y%m') + '15'
        result.index = pd.to_datetime(result.index, format='%Y%m%d')
        result.index = result.index.strftime('%Y%m%d')
        return result

    elif rule == "S13":
        # 今年以來稅後獲利衰退YOY達10%
        df = get_measure_data("稅後純益率累季(%)")
        result =  (df<10 )*1
        result.index = pd.to_datetime(result.index.astype(str) + '01', format='%Y%m%d')
        result.index = adjust_date(result.index)
        result.index = result.index.strftime('%Y%m') + '15'
        result.index = pd.to_datetime(result.index, format='%Y%m%d')
        result.index = result.index.strftime('%Y%m%d')
        return result

    elif rule == "S14":
        # 股票跌破年線且比大盤弱
        df1, df2, df3 = align_dataframes(get_measure_data("收盤價"),get_measure_data("年線"),get_measure_data("與大盤比年報酬率(%)"))
        return ((df1 < df2) * (df3 < -5)).fillna(0) * 1

    elif rule == "S15":
        # 股票跌破半年線且比大盤弱
        df1, df2, df3 = align_dataframes(get_measure_data("收盤價"),get_measure_data("半年線"),get_measure_data("與大盤比半年報酬率(%)"))
        return ((df1 < df2) * (df3 < 5)).fillna(0) * 1

    elif rule == "S16":
        # PB百分位小於0.2
        df = get_measure_data("股價淨值比_百分位")
        return ((df < 0.2)).fillna(0) * 1

    elif rule == "S17":
        # PB百分位大於0.8
        df = get_measure_data("股價淨值比_百分位")
        return ((df > 0.8)).fillna(0) * 1

    elif rule == "S18":
        # 累計EPS的YoY小於-10%
        df = get_measure_data("累計稅後EPS(元)")

        result = ((df.bfill() / df.shift(12).bfill() - 1 ) < -0.1).fillna(0) * 1
        result.index = pd.to_datetime(result.index.astype(str) + '01', format='%Y%m%d')
        result.index = result.index + pd.DateOffset(months=1)
        result.index = result.index.strftime('%Y%m') + '15'
        result.index = pd.to_datetime(result.index, format='%Y%m%d')
        result.index = result.index.strftime('%Y%m%d')
        return result

    elif rule == "S19":
        # 單季營業利益連續兩季衰退
        df = get_measure_data("營業利益率(%)")
        result =  ((df < 0) * ( df.shift(1) < 0) )*1
        result.index = pd.to_datetime(result.index.astype(str) + '01', format='%Y%m%d')
        result.index = adjust_date(result.index)
        result.index = result.index.strftime('%Y%m') + '15'
        result.index = pd.to_datetime(result.index, format='%Y%m%d')
        result.index = result.index.strftime('%Y%m%d')
        return result

    elif rule == "S20":
        # 單季營收連兩季衰退
        df = get_measure_data("單月合併營收年成長(%)")
        result =  ((df < 0) * ( df.shift(1) < 0) )*1
        result.index = pd.to_datetime(result.index.astype(str) + '01', format='%Y%m%d')
        result.index = result.index + pd.DateOffset(months=1)
        result.index = result.index.strftime('%Y%m') + '15'
        result.index = pd.to_datetime(result.index, format='%Y%m%d')
        result.index = result.index.strftime('%Y%m%d')
        return result

    elif rule == "S21":
        # 單季營收YOY衰退達10%
        df = get_measure_data("單月合併營收年成長(%)")
        result =  ((df < -10) )*1
        result.index = pd.to_datetime(result.index.astype(str) + '01', format='%Y%m%d')
        result.index = result.index + pd.DateOffset(months=1)
        result.index = result.index.strftime('%Y%m') + '15'
        result.index = pd.to_datetime(result.index, format='%Y%m%d')
        result.index = result.index.strftime('%Y%m%d')
        return result
    elif rule == "S22":
        # 股票跌破年線且比大盤弱10%
        df1, df2, df3 = align_dataframes(get_measure_data("收盤價"),get_measure_data("年線"),get_measure_data("與大盤比年報酬率(%)"))
        return ((df1 < df2) * (df3 < -10)).fillna(0) * 1
def add_strategy_column(df,strategy):

    for strategy_name in  strategy:

        if strategy_name.lower() == "strategy_1":

            # 新增符合條件的 column
            df['strategy_1_condition'] = np.where(
                (df['Signal'] > -1)  ,
                1,
                np.where(
                    (df['Signal'] <= -3)  ,
                    -1,
                    0
                )
            )
                # 新增交易訊號的 column
            df['strategy_1_trading'] = np.where(
                ((df['strategy_1_condition'] == 1) & (df['strategy_1_condition'].shift(1)!=1)),
                1,
                np.where(
                    ((df['strategy_1_condition'] == -1) & (df['strategy_1_condition'].shift(1) != -1)),
                    -1,
                    0
                )
            )

        elif strategy_name.lower() == "strategy_2":

            # 新增符合條件的 column
            df['strategy_2_condition'] = np.where(
                (df['Signal'] > 0) & (df['Signal_lag20w'] < 0) ,
                1,
                np.where(
                    (df['Signal'] < 0) & (df['Signal_lag20w'] > 0),
                    -1,
                    0
                )
            )
                # 新增交易訊號的 column
            df['strategy_2_trading'] = np.where(
                ((df['strategy_2_condition'] == 1) & (df['strategy_2_condition'].shift(1)!=1)),
                1,
                np.where(
                    ((df['strategy_2_condition'] == -1) & (df['strategy_2_condition'].shift(1) != -1)),
                    -1,
                    0
                )
            )
        elif strategy_name.lower() == "strategy_3":

            # 新增符合條件的 column
            df['strategy_3_condition'] = np.where(
                (df['Signal_diff_20w_60w'] > 0.55) & (df['Signal'] > -2) ,
                1,
                np.where(
                    (df['Signal_diff_20w_60w'] < -0.55) & (df['Signal'] <= -2),
                    -1,
                    0
                )
            )
                # 新增交易訊號的 column
            df['strategy_3_trading'] = np.where(
                ((df['strategy_3_condition'] == 1) & (df['strategy_3_condition'].shift(1)!=1)),
                1,
                np.where(
                    ((df['strategy_3_condition'] == -1) & (df['strategy_3_condition'].shift(1) != -1)),
                    -1,
                    0
                )
            )
        elif strategy_name.lower() == "strategy_4":

            # 新增符合條件的 column
            df['strategy_4_condition'] = np.where(
                (df['Signal_diff_20w_60w'] > 0.55) & (df['Signal'] > -3) ,
                1,
                np.where(
                    (df['Signal_diff_20w_60w'] < -0.55) & (df['Signal'] <= -3),
                    -1,
                    0
                )
            )
                # 新增交易訊號的 column
            df['strategy_4_trading'] = np.where(
                ((df['strategy_4_condition'] == 1) & (df['strategy_4_condition'].shift(1)!=1)),
                1,
                np.where(
                    ((df['strategy_4_condition'] == -1) & (df['strategy_4_condition'].shift(1) != -1)),
                    -1,
                    0
                )
            )
        elif strategy_name.lower() == "strategy_5":

            # 新增符合條件的 column
            df['strategy_5_condition'] = np.where(
                (df['Signal'] > -1)  ,
                1,
                np.where(
                    (df['Signal'] <= -3)  ,
                    -1,
                    0
                )
            )
                # 新增交易訊號的 column
            df['strategy_5_trading'] = np.where(
                ((df['strategy_5_condition'] == 1) & (df['strategy_5_condition'].shift(1)!=1)),
                1,
                np.where(
                    ((df['strategy_5_condition'] == -1) & (df['strategy_5_condition'].shift(1) != -1)),
                    -1,
                    0
                )
            )


    return df
def performance_analysis(result,ticker,windowslist = [20,60,125,250,500],strategynumberlist = None,long_short = ['LongShort','Long','Short']):

    def analysis_performance(prefix, data):
        performance_dict = {}
        performance_dict[f'{prefix}'] = data.sum()
        performance_dict[f'{prefix}_mean'] = data.mean()
        performance_dict[f'{prefix}_median'] = data.median()
        performance_dict[f'{prefix}_max'] = data.max()
        performance_dict[f'{prefix}_min'] = data.min()
        performance_dict[f'{prefix}_count'] = data.count()

        return performance_dict
    def get_return_count(result, rundays,strategy_number):
        # 定義區間
        result = pd.Series(result).astype(float)
        bins = [-np.inf, -0.5, -0.4, -0.3, -0.2, -0.1, 0, 0.1, 0.2, 0.3, 0.4, 0.5, np.inf]
        labels = ['<-50%', '-50%~-40%', '-40%~-30%', '-30%~-20%', '-20%~-10%', '-10%~0%', '0%~10%', '10%~20%', '20%~30%', '30%~40%', '40%~50%', '>50%']
        # 使用 cut 函數將數據分成區間
        result[f'Return_group_{rundays}'] = pd.cut(result, bins=bins, labels=labels, right=False)

        # 計算每個區間的次數統計
        group_counts = result[f'Return_group_{rundays}'].value_counts().sort_index()

        # 將 group_counts 轉換成字典
        return pd.DataFrame([group_counts.to_dict()])
    Result = pd.DataFrame()
    for strategynumber in strategynumberlist:


        for rundays in windowslist:
            return_result = pd.DataFrame()

            if 0:
                strategy_return = result.loc[result[f'strategy_{strategynumber}_trading'] != 0,f'AfterReturn_{rundays}']
                strategy_return_long = result.loc[result[f'strategy_{strategynumber}_trading'] > 0,f'AfterReturn_{rundays}']
                strategy_return_short = result.loc[result[f'strategy_{strategynumber}_trading'] < 0,f'AfterReturn_{rundays}']
            if 1:
                strategy_return = result.loc[result[f'strategy_{strategynumber}_trading'] != 0,f'AfterReturn_Min_{rundays}']
                strategy_return_long = result.loc[result[f'strategy_{strategynumber}_trading'] > 0,f'AfterReturn_Min_{rundays}']
                strategy_return_short = result.loc[result[f'strategy_{strategynumber}_trading'] < 0,f'AfterReturn_Min_{rundays}']


            if any('LongShort'.lower() in item.lower() for item in long_short): # LongShort
                return_result_sub = pd.DataFrame([analysis_performance('Return', strategy_return)])
                return_result_sub = pd.concat([return_result_sub,get_return_count(strategy_return, rundays,strategynumber)],axis = 1)
                return_result_sub['Catagory'] = "LongShort"
                return_result = pd.concat([return_result,return_result_sub],axis = 0,ignore_index = True)
            if any('Long'.lower() in item.lower() for item in long_short): # Long
                return_result_sub = pd.DataFrame([analysis_performance('Return', strategy_return_long)])
                return_result_sub = pd.concat([return_result_sub,get_return_count(strategy_return_long, rundays,strategynumber)],axis = 1)
                return_result_sub['Catagory'] = "Long"
                return_result = pd.concat([return_result,return_result_sub],axis = 0,ignore_index = True)
            if any('Short'.lower() in item.lower() for item in long_short): # Short
                return_result_sub = pd.DataFrame([analysis_performance('Return', strategy_return_short)])
                return_result_sub = pd.concat([return_result_sub,get_return_count(strategy_return_short, rundays,strategynumber)],axis = 1)
                return_result_sub['Catagory'] = "Short"
                return_result = pd.concat([return_result,return_result_sub],axis = 0,ignore_index = True)

            return_result['Ticker'] = ticker
            return_result['StrategyNumber'] = strategynumber
            return_result['Windows'] = rundays
            Result = pd.concat([Result,return_result],axis = 0,ignore_index = True)


    return Result

def combinedata(ticker_list = None,signal = None,weights = None,user = None,long_short = ['Short'],strategy_list = ['strategy_1','strategy_2','strategy_3','strategy_4','strategy_5']):
    close = get_measure_data("收盤價")
    sma_year = get_measure_data("年線")
    market_value = get_measure_data("總市值(億)")
    start_date = pd.to_datetime(close.index.min(), format='%Y%m%d').strftime('%Y%m%d')
    end_date = pd.to_datetime(close.index.max(), format='%Y%m%d').strftime('%Y%m%d')
    all_days = pd.date_range(start=start_date, end=end_date, freq='D').strftime('%Y%m%d')
    # weights = [1 if s.startswith('B') else -1 for s in signal]
    weight_dict = dict(zip(signal,weights))
    ticker_name_df = pd.read_csv(os.path.join("Setting_TickerList.csv"), encoding='utf-8-sig')
    for ticker in ticker_list:
        result = close[str(ticker)].to_frame(name='Close')
        result['sma_year'] = sma_year[str(ticker)]
        result['Ticker'] = str(ticker)  # 在這裡新增 ticker 欄位
        result['Ticker'] = str(ticker)  # 在這裡新增 ticker 欄位
        result['market_value'] = market_value[str(ticker)] * 100000
        try:
            result['CorpName']  = ticker_name_df.loc[ticker_name_df['Ticker'].astype(str) == str(ticker),'CorpName'].values[0]
        except:
            result['CorpName'] = "NaN"
        result = result[['Ticker', 'CorpName', 'Close', 'sma_year','market_value']]

        result.index = result.index.astype(str)
        result.index.name = '日期'
        for i,signal_name in enumerate(signal):
            df = pd.read_feather(os.path.join('Data_Rule', f"{signal_name}.feather"))
            if str(ticker) not in df.columns:
                df[str(ticker)] = 0


            df = df[str(ticker)].to_frame(name=signal_name).fillna(0)*weight_dict[signal_name]
            df.index = df.index.astype(str)
            df = df.reindex(all_days).ffill(axis=0)
            df.index = df.index.astype(str)
            result = result.join(df, how='left').ffill(axis=0).fillna(0)

        result['Signal'] = sum(result[signal[i]]  for i in range(len(signal)))

        result['Signal_lag20w']=result['Signal'].rolling(20).mean()
        result['Signal_lag60w']=result['Signal'].rolling(60).mean()
        result['MinPrice_20'] = result['Close'].rolling(window=20, min_periods=1).min().shift(-20).ffill()
        result['MinPrice_60'] = result['Close'].rolling(window=60, min_periods=1).min().shift(-60).ffill()
        result['MinPrice_125'] = result['Close'].rolling(window=125, min_periods=1).min().shift(-125).ffill()
        result['MinPrice_250'] = result['Close'].rolling(window=250, min_periods=1).min().shift(-250).ffill()
        result['MinPrice_500'] = result['Close'].rolling(window=500, min_periods=1).min().shift(-500).ffill()


        result['Signal_diff_20w_60w'] = result['Signal_lag20w'] - result['Signal_lag60w']
        result['AfterReturn_20'] = (result['Close'].shift(-20).ffill() / result['Close'] - 1).round(4)
        result['AfterReturn_60'] = (result['Close'].shift(-60).ffill() / result['Close']  - 1).round(4)
        result['AfterReturn_125'] = (result['Close'].shift(-125).ffill() / result['Close'] - 1).round(4)
        result['AfterReturn_250'] = (result['Close'].shift(-250).ffill() / result['Close'] - 1).round(4)
        result['AfterReturn_500'] = (result['Close'].shift(-500).ffill() / result['Close']  - 1).round(4)
        result['AfterReturn_Min_20'] = (result['MinPrice_20'] /result['Close'] - 1).round(4)
        result['AfterReturn_Min_60'] = (result['MinPrice_60'] /result['Close']  - 1).round(4)
        result['AfterReturn_Min_125'] = (result['MinPrice_125'] / result['Close'] - 1).round(4)
        result['AfterReturn_Min_250'] = (result['MinPrice_250'] / result['Close'] - 1).round(4)
        result['AfterReturn_Min_500'] = (result['MinPrice_500'] / result['Close'] - 1).round(4)

        result['未來20天日期']  = result['Close'].shift(-20).index
        result['未來60天日期']  = result['Close'].shift(-60).index
        result['未來125天日期']  = result['Close'].shift(-125).index
        result['未來250天日期']  = result['Close'].shift(-250).index
        result['未來500天日期']  = result['Close'].shift(-500).index


        result = add_strategy_column(result,strategy_list)
        performance_table = performance_analysis(result,ticker,windowslist = [20,60,125,250,500],strategynumberlist = [1,2,3],long_short = long_short)
        performance_table = performance_table .reset_index()
        result.index = pd.to_datetime(result.index, format='%Y%m%d')
        result.reset_index(inplace=True)
        if user is None:
            result.to_feather(os.path.join('Ticker_Result', f"{ticker}.feather"))
            performance_table.to_feather(os.path.join('Ticker_Result', f"Result_Performance_Table_{ticker}.feather"))

        else:
            result.to_feather(os.path.join('Ticker_Result', f"{ticker}_{user}.feather"))
            performance_table.to_feather(os.path.join('Ticker_Result', f"Result_Performance_Table_{ticker}_{user}.feather"))


        result.rename(columns={'日期': 'Date'}, inplace=True)
        latest_date = result['Date'].max()
        df_upload = result[result['Date'].dt.weekday == 4] # 週五

        latest_data = result[result['Date'] == latest_date]

        df_upload = pd.concat([df_upload, latest_data]).drop_duplicates().reset_index(drop=True)

        if user is None:
            df_upload.to_feather(os.path.join('Ticker_Result', f"{ticker}_week.feather"))
        else:
            df_upload.to_feather(os.path.join('Ticker_Result', f"{ticker}_week_{user}.feather"))


def combinedata_week(ticker_list,user = None):
    result = pd.DataFrame()
    for ticker in ticker_list:
        if user is None:
            df = pd.read_feather(os.path.join('Ticker_Result', f"{ticker}_week.feather"))
            df.set_index(df.columns[0], inplace=True)
        else:
            df = pd.read_feather(os.path.join('Ticker_Result', f"{ticker}_week_{user}.feather"))
            df.set_index(df.columns[0], inplace=True)

        result = pd.concat([result, df],axis = 0)
    result = result.reset_index()
    if user is None:
        result.to_feather(os.path.join("Result","Result_Back.feather"))
    else:
        result.to_feather(os.path.join("Result","Result_Back_" + user + ".feather"))
    result_current = result.loc[result['Date'] == result['Date'].max(),:]

    if user is None:
        result_current.to_feather(os.path.join("Result","Result_Current.feather"))
    else:
        result_current.to_feather(os.path.join("Result","Result_Current_" + user + ".feather"))

def combinedata_daily(ticker_list,user = None,strategy_list = ['strategy_1','strategy_2','strategy_3','strategy_4','strategy_5']):
    result = pd.DataFrame()
    for ticker in ticker_list:
        if user is None:
            df = pd.read_feather(os.path.join('Ticker_Result', f"{ticker}.feather"))
            df.set_index(df.columns[0], inplace=True)
        else:
            df = pd.read_feather(os.path.join('Ticker_Result', f"{ticker}_{user}.feather"))
            df.set_index(df.columns[0], inplace=True)
        result = pd.concat([result, df],axis = 0)
    result.reset_index(drop=False, inplace=True)
    if user is None:
        result.to_feather(os.path.join("Result","Result_Back_Daily.feather"))
    else:
        result.to_feather(os.path.join("Result","Result_Back_Daily_" + user + ".feather"))

    # result_trading_list_strategy_1 = result[(result['strategy_1_trading'] != 0 ) |  (result['strategy_2_trading']!=0) | (result['strategy_3_trading']!=0) | (result['strategy_4_trading']!=0) ]
    result_trading_list_strategy = result.loc[
        result[[f"{strategy}_trading" for strategy in strategy_list]].any(axis=1)
    ]
    if user is None:
        result_trading_list_strategy.to_feather(os.path.join("Result","Result_Back_Daily_Trading_List.feather"))
    else:
        result_trading_list_strategy.to_feather(os.path.join("Result","Result_Back_Daily_Trading_List_" + user + ".feather"))


def combinedata_performance(ticker_list,user = None):
    result = pd.DataFrame()
    for ticker in ticker_list:
        if user is None:
            df = pd.read_feather(os.path.join('Ticker_Result', f"Result_Performance_Table_{ticker}.feather"))
            df.set_index(df.columns[0], inplace=True)

        else:
            df = pd.read_feather(os.path.join('Ticker_Result', f"Result_Performance_Table_{ticker}_{user}.feather"))
            df.set_index(df.columns[0], inplace=True)

        result = pd.concat([result, df],axis = 0)
    result = result.reset_index()
    if user is None:
        result.to_feather(os.path.join("Result","Result_Performance_Table.feather"))
    else:
        result.to_feather(os.path.join("Result","Result_Performance_Table_" + user + ".feather"))

if __name__ == '__main__':

    build_rule_list(['B0','B1','B2','B3','B4'],['S0','S1','S2','S3','S4'])
    # Date,ticker,corpname,Close,sma_year
    close = get_measure_data("收盤價")
    ticker_list = list(close.columns)
    # ticker_list = ['1101','1102','1301','1326','1402','2101','2105','2106','2227','2258','2301']

    signal = ['B0','B1','B2','B3','B4','S0','S2','S1','S3','S4']
    buy_signals_weights = [1,1,1,1,1]
    sell_signals_weights = [-1,-1,-1,-1,-1]
    weights = buy_signals_weights + sell_signals_weights

    combinedata(ticker_list,signal,weights)
    combinedata_week(ticker_list)

    # my_file_path= 'Result_Back.csv'
    # target_url = 'https://docs.google.com/spreadsheets/d/1RlID2s6K89GcLc7MhKUm1qf0JLTY4rqysH9hVjxDVeM/edit?gid=1109596478#gid=1109596478'
    # target_sheetname='Data'
    # Equity168.Upload2Gspread(my_file_path,target_url,target_sheetname, replace_values=False)
    # my_file_path= 'Result_Current.csv'
    # target_url = 'https://docs.google.com/spreadsheets/d/1RlID2s6K89GcLc7MhKUm1qf0JLTY4rqysH9hVjxDVeM/edit?gid=1109596478#gid=1109596478'
    # target_sheetname='CurrentData'
    # Equity168.Upload2Gspread(my_file_path,target_url,target_sheetname, replace_values=False)