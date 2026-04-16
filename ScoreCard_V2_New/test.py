import pandas as pd
import os
df = pd.read_feather(os.path.join(os.path.dirname(os.path.abspath(__file__)),'CMoney_Measure','df_年線.feather'))
# df.to_csv(os.path.join(os.path.dirname(os.path.abspath(__file__)),'CMoney_Measure','df_年線.csv'),index=False,encoding='utf-8-sig')
# print(df)
df = pd.read_feather(os.path.join(os.path.dirname(os.path.abspath(__file__)),'CMoney_Measure','df_收盤價.feather'))
# df.to_csv(os.path.join(os.path.dirname(os.path.abspath(__file__)),'CMoney_Measure','df_收盤價.csv'),index=False,encoding='utf-8-sig')

df = pd.read_feather(os.path.join('Result','Result_Current_Eason篩選表V2_Show.feather'))
# df.to_csv(os.path.join('Result','Result_Current_Eason篩選表V2_Show.csv'),index=False,encoding='utf-8-sig')
print(df)


df = pd.read_feather(os.path.join(os.path.dirname(os.path.abspath(__file__)),'CMoney_Measure','df_累計合併營收成長(%).feather'))
df.to_csv(os.path.join(os.path.dirname(os.path.abspath(__file__)),'CMoney_Measure','df_累計合併營收成長(%).csv'),index=False,encoding='utf-8-sig')