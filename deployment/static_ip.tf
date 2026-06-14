# A Lightsail static IP so the public address survives VM rebuilds. Without this,
# Lightsail assigns a new dynamic IP every time the instance is replaced (any
# user_data/secret change is ForceNew), which would mean re-pointing DNS after
# every deploy. The static IP is allocated once and re-attached to whatever
# instance currently exists, so DNS is set a single time.
resource "aws_lightsail_static_ip" "vm" {
  name = "haputele-static-ip"
}

resource "aws_lightsail_static_ip_attachment" "vm" {
  static_ip_name = aws_lightsail_static_ip.vm.name
  instance_name  = aws_lightsail_instance.debian_vm.name
}
