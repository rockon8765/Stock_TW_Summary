import pandas as pd
import os
import numpy as np
from rule_build import get_rule_dictionary

class build_show_report():
    def __init__(self,from_file_name):
        self.from_file_name = from_file_name

    def add_dividend(self,df):

        df = self.add_dividend_reasearcher(df)
        df = self.add_dividend_cmoney(df)

        return df

    def add_dividend_cmoney(self,df):
        dividend = pd.read_csv("dividend_cmoney.csv")
        dividend['預估殖利率_財報推估(%)'] = dividend['預估殖利率'].astype(str)
        df['標的代號'] = df['標的代號'].astype(str)
        dividend['Ticker'] = dividend['Ticker'].astype(str)
        dividend = dividend.loc[:,['Ticker','預估殖利率_財報推估(%)']]
        df = df.drop(columns = ['Ticker'],errors = 'ignore')
        df = df.merge(dividend,left_on ="標的代號",right_on =  'Ticker',how = 'left')
        df = df.drop(columns = ['Ticker'],errors = 'ignore')
        df.fillna("-", inplace=True)
        return df

    def add_dividend_reasearcher(self,df):
        if 0:
            dividend = pd.read_csv("dividend_reasearcher.csv")
            dividend['Ticker'] = dividend['Ticker'].astype(str)
            df = df.merge(dividend,left_on ="標的代號",right_on =  'Ticker',how = 'left')
            df.fillna("-", inplace=True)
            return df
        elif 1:
            # dividend = pd.read_excel("Show.xlsx", sheet_name='Show', header=0)
            dividend = pd.read_csv("Show.csv",encoding = "big5")
            dividend['代碼'] = dividend['代碼'].astype(str)
            # 剔除不需要的欄位 名稱是 日期 名稱
            dividend = dividend.drop(columns = ['日期','名稱'],errors = 'ignore')
            df = df.merge(dividend,left_on ="標的代號",right_on =  '代碼',how = 'left')
            df.fillna("-", inplace=True)
            return df

    def build(self):

        df = pd.read_feather(os.path.join("Result",self.from_file_name + ".feather"))

        original_columns = df.columns.tolist()
        buy_rules, sell_rules = get_rule_dictionary()
        # 建立對應的字典來替換欄位名稱
        rename_dict_rule_name = {**{value[0]: value[1] for key, value in buy_rules.items()},
                    **{value[0]: value[1] for key, value in sell_rules.items()}}
        # 使用 DataFrame 的 rename 函數進行替換
        df.rename(columns=rename_dict_rule_name, inplace=True)


        rename_dict = {
            'Date': '日期',
            'Ticker': '標的代號',
            'CorpName': '標的名稱',
            'Close': '收盤價',
        }
        df.rename(columns=rename_dict, inplace=True)
        keep_columns = ['日期','標的代號','標的名稱','收盤價',]


        existing_rule_columns = [col for col in list(rename_dict_rule_name.values()) if col in df.columns]
        columns_to_keep = keep_columns + existing_rule_columns
        existing_columns = [col for col in columns_to_keep if col in df.columns]
        report_show = df.loc[:,existing_columns]
        report_show['分數'] = (report_show[existing_rule_columns] !=0).sum(axis =1)

        report_show.loc[:, existing_rule_columns] = np.where(
            report_show.loc[:, existing_rule_columns] != 0,
            "V",
            "-"
        )
        report_show.to_csv("Report.csv",encoding = 'utf-8-sig')
        report_show['標的代號'] = report_show['標的代號'].astype(str)
        report_show = report_show.fillna('-')
        report_show = self.add_dividend(report_show)
        report_show = report_show.astype({col: 'str' for col in report_show.select_dtypes(include='object').columns})
        cols = report_show.columns.tolist()

        # 先移除目標欄位
        cols.remove('預估殖利率_財報推估(%)')

        # 插入到 '分數' 後面（即 '分數' 的 index + 1）
        insert_index = cols.index('分數') + 1
        cols.insert(insert_index, '預估殖利率_財報推估(%)')

        # 套用新順序
        report_show = report_show[cols]

        report_show.to_feather(os.path.join("Result",self.from_file_name + "_Show"  + ".feather"))
if __name__ == '__main__':
    if 0:
        build_show_report('Result_Current_Combine').build()
    if 1:
        build_show_report('Result_Back_Combine').build()