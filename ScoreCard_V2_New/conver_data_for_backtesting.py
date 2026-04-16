import pandas as pd
import feather
def conver_result_to_backtesing_use_data(user=None):
    if user is None:
        df = pd.read_feather(f'Result_Back_Daily.feather')
    else:
        df = pd.read_feather(f'Result_Back_Daily_{user}.feather')

    pivot_df = df.pivot(index='日期', columns='Ticker', values='Signal')
    pivot_df.columns = pivot_df.columns.astype(str)
    pivot_df = pivot_df.fillna(0)
    if user is None:
        pivot_df.to_feather(f'Result_Back_Backtesting.feather')
    else:
        pivot_df.to_feather(f'Result_Back_{user}_Backtesting.feather')

if __name__ == '__main__':
    conver_result_to_backtesing_use_data()
    conver_result_to_backtesing_use_data('Calvin')