#![doc = include_str!("../README.md")]
#![doc(
    html_logo_url = "https://github.com/bysanxi/murmur/raw/main/public/murmur.png",
    html_favicon_url = "https://github.com/bysanxi/murmur/raw/main/public/murmur.png"
)]

mod event;

use proc_macro::TokenStream;

#[proc_macro_derive(Event)]
pub fn derive_event(input: TokenStream) -> TokenStream {
    event::proc_derive_event(input)
}
