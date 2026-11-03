# dmgbuild settings for the drag-to-Applications disk image (desktop/dmg.sh passes app=, background= and icon= with -D).
# The window is 660×400 points to match background.svg: the app on the left, the Applications link on the right.
import os.path

app = defines["app"]
name = os.path.basename(app)

format = "UDZO"
filesystem = "HFS+"
files = [app]
symlinks = {"Applications": "/Applications"}
icon = defines["icon"]
background = defines["background"]

window_rect = ((200, 120), (660, 400))
default_view = "icon-view"
show_status_bar = False
show_tab_view = False
show_toolbar = False
show_pathbar = False
show_sidebar = False
show_icon_preview = False
include_icon_view_settings = True
arrange_by = None
icon_size = 128
text_size = 13
label_pos = "bottom"
icon_locations = {name: (180, 190), "Applications": (480, 190)}
hide_extension = [name]
