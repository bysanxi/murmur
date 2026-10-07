#![doc = include_str!("../README.md")]
#![doc(
    html_logo_url = "https://github.com/bysanxi/murmur/raw/main/public/murmur.png",
    html_favicon_url = "https://github.com/bysanxi/murmur/raw/main/public/murmur.png"
)]

use proc_macro::TokenStream;

mod dispatch;

#[proc_macro_attribute]
pub fn dispatch(attr: TokenStream, item: TokenStream) -> TokenStream {
    dispatch::proc_dispatch(attr, item)
}
